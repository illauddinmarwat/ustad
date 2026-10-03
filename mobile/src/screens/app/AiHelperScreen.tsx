import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { Icon } from '../../components/ui/Icon';
import { useAuth } from '../../context/AuthContext';
import type { StringId } from '../../i18n/strings';
import { useT } from '../../i18n/useT';
import {
  AI_ERROR_STRING,
  askQuestions,
  makeJobDraft,
  makeListingDraft,
  type AiErrorCode,
  type AiQuestion,
  type QA,
} from '../../lib/aiDraft';
import { looksLikeContact } from '../../lib/contactCheck';
import { chooseLang } from '../../lib/i18nText';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography, urduTypography } from '../../theme/typography';

type Nav = NativeStackNavigationProp<RootStackParamList, 'AiHelper'>;

type Phase = 'intro' | 'thinking' | 'questions' | 'drafting' | 'ready' | 'error';

/**
 * Help me write: a full-screen chat that asks up to three tap-to-answer questions and then prepares a draft in
 * English and Urdu. It hands the draft back to the wizard; the author reviews and approves it there.
 * It never asks about or suggests a price.
 */
export default function AiHelperScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'AiHelper'>>();
  const { mode, serviceTitle, categories } = route.params;
  const { language } = useAuth();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const lang = language ?? 'en';

  const [phase, setPhase] = useState<Phase>('intro');
  const [input, setInput] = useState('');
  const [said, setSaid] = useState('');
  const [questions, setQuestions] = useState<AiQuestion[]>([]);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [error, setError] = useState<AiErrorCode | null>(null);
  const [draft, setDraft] = useState<unknown>(null);
  const [stage, setStage] = useState<'questions' | 'draft'>('questions');
  const scroller = useRef<ScrollView>(null);

  const baseText = (extra: string) => [mode === 'listing' && serviceTitle ? `Service: ${serviceTitle}` : '', extra].filter(Boolean).join('. ');

  const fail = (code: AiErrorCode) => {
    setError(code);
    setPhase('error');
  };

  const ask = async (text: string) => {
    setError(null);
    setStage('questions');
    setPhase('thinking');
    const res = await askQuestions({ kind: mode, lang: chooseLang(text, lang), text: baseText(text), categories });
    if (!res.ok) return fail(res.error);
    if (res.data.length === 0) return createDraft(text, []);
    setQuestions(res.data);
    setPicked({});
    setPhase('questions');
  };

  const send = async () => {
    const text = input.trim();
    if (mode === 'job' && text.length < 3) return;
    if (looksLikeContact(text)) {
      // Stay on the typing step so they can remove the number.
      setError('contact');
      return;
    }
    setSaid(text);
    setInput('');
    await ask(text);
  };

  const answersFor = (qs: AiQuestion[], chosen: Record<string, string>): QA[] =>
    qs.filter((q) => chosen[q.id]).map((q) => ({ question: q.text, answer: chosen[q.id] }));

  const createDraft = async (text: string, answers: QA[]) => {
    setError(null);
    setStage('draft');
    setPhase('drafting');
    const res =
      mode === 'job'
        ? await makeJobDraft({ lang: chooseLang(text, lang), text: baseText(text), categories, answers })
        : await makeListingDraft({ lang: chooseLang(text, lang), text: baseText(text), answers });
    if (!res.ok) return fail(res.error);
    setDraft(res.data);
    setPhase('ready');
  };

  const useDraft = () => {
    if (mode === 'job') navigation.navigate('PostJob', { draft: draft as never });
    else navigation.navigate('ListingWizard', { draft: draft as never });
  };

  // Nothing they typed is lost: when the helper cannot help, their own words go into the form.
  const writeMyself = () => {
    const mine = said.trim();
    if (!mine) {
      navigation.goBack();
      return;
    }
    if (mode === 'job') navigation.navigate('PostJob', { prefill: { description: mine } });
    else navigation.navigate('ListingWizard', { prefill: { about: mine } });
  };

  const bot = (text: string, key: string, ur?: string) => (
    <View key={key} style={styles.botRow}>
      <View style={styles.spark}>
        <Icon name="zap" size={14} color={colors.primaryInk} />
      </View>
      <View style={styles.botBubble}>
        <Text style={styles.botText}>{text}</Text>
        {ur ? <Text style={styles.botUr}>{ur}</Text> : null}
      </View>
    </View>
  );

  const introId: StringId = mode === 'job' ? 'ai.intro.job' : 'ai.intro.listing';
  const canType = phase === 'intro';

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scroller}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
      >
        <View style={styles.top}>
          <Chip label={t('ai.helpMe').en} tone="info" icon="zap" />
          <Text style={styles.note}>{t('ai.noPriceNote').en}</Text>
        </View>

        {bot(t(introId).en, 'intro', t(introId).ur)}
        {phase === 'intro' ? (
          <View style={styles.tipRow}>
            <Icon name="mic" size={14} color={colors.primary} />
            <View style={styles.tipText}>
              <Text style={styles.tip}>{t('ai.tip.speak').en}</Text>
              <Text style={styles.tipUr}>{t('ai.tip.speak').ur}</Text>
            </View>
          </View>
        ) : null}

        {said ? (
          <View style={styles.meRow}>
            <View style={styles.meBubble}>
              <Text style={styles.meText}>{said}</Text>
            </View>
          </View>
        ) : null}

        {phase === 'thinking' ? bot(t('ai.thinking').en, 'thinking', t('ai.thinking').ur) : null}

        {phase === 'questions' || phase === 'drafting' || phase === 'ready' ? (
          <>
            {bot(t('ai.questions.lead').en, 'lead', t('ai.questions.lead').ur)}
            {questions.map((q) => (
              <View key={q.id} style={styles.qBlock}>
                {bot(q.text, q.id)}
                <View style={styles.chips}>
                  {q.options.map((o) => {
                    const on = picked[q.id] === o;
                    return (
                      <Pressable
                        key={o}
                        disabled={phase !== 'questions'}
                        onPress={() => setPicked((p) => ({ ...p, [q.id]: on ? '' : o }))}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={[styles.pill, on && styles.pillOn]}
                      >
                        <Text style={[typography.label, on ? styles.pillTextOn : styles.pillText]}>{o}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </>
        ) : null}

        {phase === 'drafting' ? bot(t('ai.drafting').en, 'drafting', t('ai.drafting').ur) : null}
        {phase === 'ready' ? bot(t('ai.draftReady').en, 'ready', t('ai.draftReady').ur) : null}

        {phase === 'intro' && error === 'contact' ? <Banner id="ai.error.contact" tone="warning" /> : null}

        {phase === 'error' && error ? (
          <>
            <Banner id={AI_ERROR_STRING[error]} tone="warning" />
            <View style={styles.actions}>
              {error !== 'limit' && error !== 'disabled' && error !== 'contact' ? (
                <Button
                  labelId="ai.continue"
                  onPress={() => (stage === 'draft' ? createDraft(said, answersFor(questions, picked)) : ask(said))}
                  iconLeft="refresh-cw"
                  variant="secondary"
                />
              ) : null}
              <Button labelId="ai.writeMyself" onPress={writeMyself} variant="secondary" />
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.foot, { paddingBottom: insets.bottom + spacing.md }]}>
        {phase === 'questions' ? (
          <View style={styles.actions}>
            <Button
              labelId="ai.createDraft"
              onPress={() => createDraft(said, answersFor(questions, picked))}
              iconLeft="zap"
              fullWidth
            />
            <Button labelId="ai.skip" onPress={() => createDraft(said, [])} variant="ghost" fullWidth />
          </View>
        ) : phase === 'ready' ? (
          <Button labelId="ai.reviewDraft" onPress={useDraft} iconRight="arrow-right" fullWidth />
        ) : canType ? (
          <View style={styles.inputRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={t('ai.input.placeholder').en}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              multiline
              accessibilityLabel={t('ai.input.placeholder').en}
            />
            <Pressable
              onPress={send}
              accessibilityRole="button"
              accessibilityLabel={mode === 'listing' && !input.trim() ? t('ai.continue').en : 'Send'}
              disabled={mode === 'job' && input.trim().length < 3}
              style={[styles.send, mode === 'job' && input.trim().length < 3 && styles.sendOff]}
            >
              <Icon name="send" size={18} color={colors.primaryInk} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  note: { ...typography.caption, color: colors.textMuted },
  botRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  spark: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botBubble: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  tipRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginLeft: 34 },
  tipText: { flex: 1, gap: 2 },
  tip: { ...typography.caption, color: colors.textMuted },
  tipUr: { ...urduTypography.caption, color: colors.textMuted, textAlign: 'right' },
  botText: { ...typography.body, color: colors.textStrong },
  botUr: { ...urduTypography.bodySm, color: colors.textMuted, textAlign: 'right' },
  meRow: { alignItems: 'flex-end' },
  meBubble: { maxWidth: '88%', backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md },
  meText: { ...typography.body, color: colors.primaryInk },
  qBlock: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginLeft: 34 },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.textBody },
  pillTextOn: { color: colors.primaryInk },
  actions: { gap: spacing.sm },
  foot: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textStrong,
    backgroundColor: colors.bg,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOff: { opacity: 0.4 },
});
