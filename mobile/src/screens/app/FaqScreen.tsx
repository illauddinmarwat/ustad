import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { Icon } from '../../components/ui/Icon';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n/useT';
import { trackEvent } from '../../lib/analytics';
import { supabase } from '../../lib/supabase';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography, urduTypography } from '../../theme/typography';

type FaqRow = {
  id: string;
  slug: string;
  category: string;
  question_en: string;
  question_ur: string | null;
  answer_en: string;
  answer_ur: string | null;
  score?: number;
};

type Lang = 'en' | 'ur';

const SUPPORT_EMAIL = 'support@ustad.local';

export default function FaqScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { t } = useT();
  const insets = useSafeAreaInsets();

  const [lang, setLang] = useState<Lang>('en');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FaqRow[]>([]);
  const [allFaqs, setAllFaqs] = useState<FaqRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);

  useEffect(() => {
    void loadAll();
  }, []);

  const loadAll = async () => {
    const { data, error } = await supabase
      .from('faqs')
      .select('id,slug,category,question_en,question_ur,answer_en,answer_ur')
      .eq('is_active', true)
      .order('category', { ascending: true });
    if (error) {
      setBannerError(error.message);
      return;
    }
    setAllFaqs((data ?? []) as FaqRow[]);
  };

  const runSearch = async (text: string) => {
    setQuery(text);
    if (!text.trim()) {
      setResults([]);
      return;
    }
    const { data, error } = await supabase.rpc('search_faqs', { p_query: text, p_limit: 10 });
    if (error || !Array.isArray(data)) {
      setResults([]);
      return;
    }
    setResults(data as FaqRow[]);
    void trackEvent('faq_searched', userId, { q: text, hits: (data as FaqRow[]).length });
  };

  const visible = query.trim() ? results : allFaqs;
  const empty = query.trim() && results.length === 0;

  const grouped = useMemo(() => {
    const map = new Map<string, FaqRow[]>();
    visible.forEach((row) => {
      const arr = map.get(row.category) ?? [];
      arr.push(row);
      map.set(row.category, arr);
    });
    return Array.from(map.entries());
  }, [visible]);

  const toggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const contactSupport = () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Ustad support request')}`;
    void trackEvent('faq_support_handoff', userId, { q: query });
    void Linking.openURL(url).catch(() => setBannerError('Could not open email client'));
  };

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <ScreenHeader titleId="faq.title" subtitleId="faq.subtitle" />

      <Card padding="lg">
        <View style={styles.langRow}>
          {(['en', 'ur'] as Lang[]).map((l) => {
            const active = lang === l;
            return (
              <Pressable
                key={l}
                accessibilityRole="button"
                onPress={() => setLang(l)}
                style={[styles.langBtn, active && styles.langBtnActive]}
              >
                <Text style={[styles.langText, active && styles.langTextActive]}>
                  {l === 'en' ? 'English' : 'اردو'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Button
          labelId="faq.openChat"
          onPress={() => navigation.navigate('FaqChat')}
          iconLeft="message-circle"
          variant="secondary"
          fullWidth
          style={styles.openChat}
        />
      </Card>

      <Card padding="md">
        <View style={styles.searchRow}>
          <Icon name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={runSearch}
            placeholder={lang === 'en' ? 'Search the FAQ' : 'سوال تلاش کریں'}
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
        </View>
      </Card>

      {bannerError && <Banner text={bannerError} tone="warning" />}

      {grouped.map(([category, rows]) => (
        <Card key={category} padding="lg">
          <Text style={styles.categoryTitle}>{category}</Text>
          {rows.map((row, idx) => {
            const open = expanded[row.id] ?? false;
            const question = lang === 'ur' && row.question_ur ? row.question_ur : row.question_en;
            const answer = lang === 'ur' && row.answer_ur ? row.answer_ur : row.answer_en;
            const isUrdu = lang === 'ur';
            return (
              <Pressable
                key={row.id}
                style={[styles.qaRow, idx === 0 && styles.qaRowFirst]}
                onPress={() => toggle(row.id)}
                accessibilityRole="button"
              >
                <View style={styles.qaHeader}>
                  <Text style={[styles.q, isUrdu && styles.qUrdu]}>{question}</Text>
                  <View style={styles.qaHeadRight}>
                    {typeof row.score === 'number' && row.score > 0 && (
                      <Chip label={`${Math.round(row.score * 100)}%`} tone="primary" />
                    )}
                    <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
                  </View>
                </View>
                {open && <Text style={[styles.a, isUrdu && styles.aUrdu]}>{answer}</Text>}
              </Pressable>
            );
          })}
        </Card>
      ))}

      {empty && (
        <Card padding="lg">
          <View style={styles.emptyWrap}>
            <Icon name="help-circle" size={32} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {lang === 'en' ? 'No FAQs matched your question.' : 'آپ کے سوال سے کوئی FAQ نہیں ملا۔'}
            </Text>
            <Button
              labelId="faq.contactSupport"
              onPress={contactSupport}
              iconLeft="mail"
              fullWidth
              style={styles.supportBtn}
            />
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1 },
  langRow: { flexDirection: 'row', gap: spacing.sm },
  langBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
  },
  langBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { ...typography.button, color: colors.textStrong },
  langTextActive: { color: colors.primaryInk },
  openChat: { marginTop: spacing.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textStrong,
  },
  categoryTitle: { ...typography.title, color: colors.primaryDeep, marginBottom: spacing.sm, textTransform: 'capitalize' },
  qaRow: { paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  qaRowFirst: { borderTopWidth: 0, paddingTop: 0 },
  qaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  qaHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  q: { ...typography.subtitle, color: colors.textStrong, flex: 1 },
  qUrdu: { ...urduTypography.subtitle, color: colors.textStrong, textAlign: 'right', writingDirection: 'rtl' },
  a: { ...typography.body, color: colors.textBody, marginTop: 8 },
  aUrdu: { ...urduTypography.body, color: colors.textBody, marginTop: 8, textAlign: 'right', writingDirection: 'rtl' },
  emptyWrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  supportBtn: { alignSelf: 'stretch' },
});
