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
import { chooseLang, type Lang } from '../../lib/i18nText';
import { useSpeechInput } from '../../lib/useSpeechInput';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography, urduTypography } from '../../theme/typography';

type Nav = NativeStackNavigationProp<RootStackParamList, 'AiHelper'>;

type Phase = 'pick' | 'intro' | 'thinking' | 'questions' | 'drafting' | 'ready' | 'error';

/**
 * Help me write: a full-screen chat that asks up to three tap-to-answer questions and then prepares a draft in
 * English and Urdu. It hands the draft back to the wizard; the author reviews and approves it there.
 * It never asks about or suggests a price.
 */
export default function AiHelperScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'AiHelper'>>();
  const { mode, serviceTitle, serviceId, services, categories, attached, startText } = route.params;
  const { language } = useAuth();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const lang = language ?? 'en';

  const [service, setService] = useState<{ id?: string; title: string } | null>(serviceTitle ? { id: serviceId, title: serviceTitle } : null);
  const needsService = mode === 'listing' && !serviceTitle && (services?.length ?? 0) > 0;
  const [phase, setPhase] = useState<Phase>(needsService ? 'pick' : 'intro');
  const [input, setInput] = useState(startText ?? '');
  const [said, setSaid] = useState('');
  const [questions, setQuestions] = useState<AiQuestion[]>([]);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [error, setError] = useState<AiErrorCode | null>(null);
  const [draft, setDraft] = useState<unknown>(null);
  const [stage, setStage] = useState<'questions' | 'draft'>('questions');
  const scroller = useRef<ScrollView>(null);

  // Speaking: what was typed before stays, and the spoken words follow it.
  const typedBefore = useRef('');
  const [speakLang, setSpeakLang] = useState<Lang>(lang);
  const speech = useSpeechInput((spoken) => setInput([typedBefore.current, spoken].filter(Boolean).join(' ')));
  const toggleMic = () => {
    if (speech.listening) {
      speech.stop();
      return;
    }
    typedBefore.current = input.trim();
    void speech.start(speakLang);
  };

  const baseText = (extra: string) => [mode === 'listing' && service ? `Service: ${service.title}` : '', extra].filter(Boolean).join('. ');

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
        ? await makeJobDraft({ lang: chooseLang(text, lang), text: baseText(text), categories, answers, attached })
        : await makeListingDraft({ lang: chooseLang(text, lang), text: baseText(text), answers, attached });
    if (!res.ok) return fail(res.error);
    setDraft(res.data);
    setPhase('ready');
  };

  const useDraft = () => {
    // Back to the same wizard, so what was added in step 1 is still there.
    if (mode === 'job') navigation.popTo('PostJob', { draft: draft as never }, { merge: true });
    else navigation.popTo('ListingWizard', { draft: draft as never, templateId: service?.id }, { merge: true });
  };

  // Nothing they typed is lost: when the helper cannot help, their own words go into the form.
  const writeMyself = () => {
    const mine = said.trim();
    if (!mine) {
      navigation.goBack();
      return;
    }
    if (mode === 'job') navigation.popTo('PostJob', { prefill: { description: mine } }, { merge: true });
    else navigation.popTo('ListingWizard', { prefill: { about: mine }, templateId: service?.id }, { merge: true });
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
  // With the in-app microphone the tip is about it; otherwise the phone keyboard microphone (not on the web).
  const tipId: StringId | null = speech.available ? 'ai.tip.mic' : Platform.OS === 'web' ? null : 'ai.tip.speak';

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

        {phase === 'pick' ? (
          <>
            {bot(t('ai.pickService').en, 'pick', t('ai.pickService').ur)}
            <View style={styles.chips}>
              {(services ?? []).map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    setService(s);
                    setPhase('intro');
                  }}
                  accessibilityRole="button"
                  style={styles.pill}
                >
                  <Text style={[typography.label, styles.pillText]}>{s.title}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <>
            {service && needsService ? (
              <View style={styles.meRow}>
                <View style={styles.meBubble}>
                  <Text style={styles.meText}>{service.title}</Text>
                </View>
              </View>
            ) : null}
            {bot(t(introId).en, 'intro', t(introId).ur)}
          </>
        )}
        {phase === 'intro' && tipId ? (
          <View style={styles.tipRow}>
            <Icon name="mic" size={14} color={colors.primary} />
            <View style={styles.tipText}>
              <Text style={styles.tip}>{t(tipId).en}</Text>
              <Text style={styles.tipUr}>{t(tipId).ur}</Text>
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
          <>
          {speech.available ? (
            <View style={styles.speakRow}>
              <Text style={styles.speakLabel}>{t('ai.mic.speakIn').en}</Text>
              {(['en', 'ur'] as Lang[]).map((l) => (
                <Pressable
                  key={l}
                  onPress={() => setSpeakLang(l)}
                  disabled={speech.listening}
                  accessibilityRole="button"
                  accessibilityState={{ selected: speakLang === l }}
                  style={[styles.speakPill, speakLang === l && styles.speakPillOn]}
                >
                  <Text style={[styles.speakPillText, speakLang === l && styles.pillTextOn]}>{l === 'en' ? 'English' : 'اردو'}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {speech.listening ? <Text style={styles.listening}>{t('ai.mic.listening').en}</Text> : null}
          {speech.error === 'denied' ? <Text style={styles.micError}>{t('ai.mic.denied').en}</Text> : null}
          {speech.error === 'failed' ? <Text style={styles.micError}>{t('ai.mic.failed').en}</Text> : null}
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
            {speech.available ? (
              <Pressable
                onPress={toggleMic}
                accessibilityRole="button"
                accessibilityLabel={speech.listening ? t('ai.mic.stop').en : t('ai.mic.speak').en}
                accessibilityState={{ selected: speech.listening }}
                style={[styles.mic, speech.listening && styles.micOn]}
              >
                <Icon name={speech.listening ? 'square' : 'mic'} size={18} color={speech.listening ? colors.primaryInk : colors.primary} />
              </Pressable>
            ) : null}
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
          </>
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
  mic: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micOn: { backgroundColor: colors.danger, borderColor: colors.danger },
  speakRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  speakLabel: { ...typography.caption, color: colors.textMuted },
  speakPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  speakPillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  speakPillText: { ...typography.caption, color: colors.textBody },
  listening: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },
  micError: { ...typography.caption, color: colors.warning, marginBottom: spacing.sm },
});
