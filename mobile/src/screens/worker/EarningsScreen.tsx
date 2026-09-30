import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommissionCard } from '../../components/CommissionCard';
import { BiText } from '../../components/ui/BiText';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { formatPkr, useWorkerEarnings } from '../../lib/workerStats';
import { colors, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

/** Ustad earnings: this month from the Hisab ledger (recorded jobs), plus what is owed to Ustad. */
export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user.id;
  const { entries, loaded, summary } = useWorkerEarnings(uid);

  return (
    <ScrollView
      contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <BiText id="earnings.title" variant="displayLg" tone="strong" />

      <Card padding="lg">
        <BiText id="earnings.net" variant="label" tone="muted" />
        <Text style={styles.amount}>{formatPkr(summary.monthNet)}</Text>
        <View style={styles.split}>
          <Stat id="earnings.gross" value={formatPkr(summary.monthGross)} />
          <Stat id="earnings.commission" value={formatPkr(summary.monthCommission)} />
          <Stat id="earnings.jobs" value={String(summary.monthJobs)} />
        </View>
      </Card>

      {uid ? <CommissionCard /> : null}

      <BiText id="earnings.recent" variant="title" tone="strong" />
      {loaded && entries.length === 0 ? (
        <Card padding="lg">
          <EmptyState icon="dollar-sign" titleId="earnings.none" subtitleId="earnings.noneHint" />
        </Card>
      ) : (
        entries.slice(0, 20).map((e) => (
          <Card key={e.id} padding="md" style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.jobTitle} numberOfLines={1}>
                {e.job_title}
              </Text>
              <Text style={styles.date}>{new Date(e.created_at).toLocaleDateString()}</Text>
            </View>
            <Text style={styles.jobAmount}>{formatPkr(Number(e.order_amount_pkr))}</Text>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

function Stat({ id, value }: { id: 'earnings.gross' | 'earnings.commission' | 'earnings.jobs'; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <BiText id={id} hideUrdu variant="caption" tone="muted" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1, gap: spacing.md },
  flex: { flex: 1 },
  amount: { color: colors.primaryDeep, fontSize: 34, fontWeight: '700', marginTop: spacing.xs },
  split: { flexDirection: 'row', marginTop: spacing.md, gap: spacing.sm },
  stat: { flex: 1 },
  statValue: { ...typography.subtitle, color: colors.textStrong },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  jobTitle: { ...typography.subtitle, color: colors.textStrong },
  date: { ...typography.caption, color: colors.textMuted },
  jobAmount: { ...typography.subtitle, color: colors.primaryDeep },
});
