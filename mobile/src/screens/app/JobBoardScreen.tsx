import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n/useT';
import { expiresIn, fetchJobPostingEnabled, formatBudget } from '../../lib/jobPosting';
import { SKILL_CATEGORIES } from '../../lib/skillCategories';
import { supabase } from '../../lib/supabase';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type Nav = NativeStackNavigationProp<RootStackParamList, 'JobBoard'>;

export type BoardJob = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  city: string | null;
  location_text: string | null;
  budget_min_pkr: number | null;
  budget_max_pkr: number | null;
  preferred_time: string | null;
  created_at: string;
  expires_at: string | null;
  quote_count: number;
  my_quote_pkr: number | null;
};

export default function JobBoardScreen() {
  const navigation = useNavigation<Nav>();
  const { session, role } = useAuth();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [jobs, setJobs] = useState<BoardJob[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJobPostingEnabled().then(setEnabled);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('list_open_jobs', {
      p_category: category,
      p_city: null,
      p_limit: 50,
    });
    if (rpcError) setError(rpcError.message);
    else setJobs((data ?? []) as BoardJob[]);
    setLoaded(true);
  }, [category]);

  useEffect(() => {
    if (session?.user.id && role === 'worker' && enabled) void load();
  }, [load, session?.user.id, role, enabled]);

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingBottom: insets.bottom + spacing.xl }]}>
      <ScreenHeader titleId="board.title" subtitleId="board.subtitle" />

      {enabled === false && <Banner id="post.disabled" tone="warning" />}
      {error ? <Banner text={error} tone="warning" /> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
        <Pill label={t('nearby.filterAll').en} active={category === null} onPress={() => setCategory(null)} />
        {SKILL_CATEGORIES.map((c) => (
          <Pill key={c.key} label={t(c.labelId).en} active={category === c.key} onPress={() => setCategory(c.key)} />
        ))}
      </ScrollView>

      {loaded && jobs.length === 0 && !error ? (
        <Card padding="lg">
          <EmptyState icon="briefcase" titleId="board.empty" subtitleId="board.emptyHint" />
        </Card>
      ) : null}

      {jobs.map((j) => {
        const budget = formatBudget(j.budget_min_pkr, j.budget_max_pkr);
        const left = expiresIn(j.expires_at);
        return (
          <Pressable key={j.id} onPress={() => navigation.navigate('BoardJob', { jobId: j.id })} accessibilityRole="button">
            <Card padding="lg">
              <Text style={styles.title}>{j.title}</Text>
              <View style={styles.chips}>
                <Chip label={j.category} tone="neutral" icon="tag" />
                {j.city ? <Chip label={j.city} tone="neutral" icon="map" /> : null}
                {budget ? <Chip label={budget} tone="primary" icon="dollar-sign" /> : null}
                {left ? <Chip label={left} tone="neutral" icon="clock" /> : null}
              </View>
              {j.description ? (
                <Text style={styles.body} numberOfLines={3}>
                  {j.description}
                </Text>
              ) : null}
              <View style={styles.foot}>
                <Text style={styles.meta}>
                  {j.quote_count} {t('board.quotes').en}
                </Text>
                {j.my_quote_pkr != null ? <Chip label={`Your quote: Rs ${j.my_quote_pkr}`} tone="accent" icon="check" /> : null}
                <Icon name="chevron-right" size={18} color={colors.textMuted} />
              </View>
            </Card>
          </Pressable>
        );
      })}

      {!session?.user.id || role !== 'worker' ? <BiText id="board.workersOnly" variant="caption" tone="muted" align="center" /> : null}
    </ScrollView>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.pill, active && styles.pillOn]}>
      <Text style={[typography.label, active ? styles.pillTextOn : styles.pillText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1, gap: spacing.md },
  filters: { flexGrow: 0 },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.textBody },
  pillTextOn: { color: colors.primaryInk },
  title: { ...typography.subtitle, color: colors.textStrong },
  body: { ...typography.body, color: colors.textBody, marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, gap: spacing.sm },
  meta: { ...typography.caption, color: colors.textMuted },
});
