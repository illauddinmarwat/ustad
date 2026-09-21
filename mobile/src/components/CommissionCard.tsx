import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  commissionState,
  dueText,
  ENTRY_LABEL,
  type CommissionEntry,
  type CommissionSummary,
} from '../lib/commission';
import { supabase } from '../lib/supabase';
import { colors, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { Banner } from './ui/Banner';
import { BiText } from './ui/BiText';
import { Card } from './ui/Card';
import { Chip } from './ui/Chip';

const TONE = { due: 'warning', overdue: 'danger', paid: 'accent', waived: 'neutral' } as const;

/** A worker's Hisab: what they owe Ustad from cash jobs, when it is due, and the history. */
export function CommissionCard() {
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [entries, setEntries] = useState<CommissionEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [s, l] = await Promise.all([
        supabase.rpc('get_my_commission_summary'),
        supabase.rpc('list_my_commissions', { p_limit: 20 }),
      ]);
      const row = (Array.isArray(s.data) ? s.data[0] : s.data) as CommissionSummary | null | undefined;
      setSummary(row ?? null);
      setEntries((l.data ?? []) as CommissionEntry[]);
      setLoaded(true);
    })().catch(() => setLoaded(true));
  }, []);

  if (!loaded) return null;
  const state = commissionState(summary, entries.length > 0);
  if (state === 'none') return null;

  const due = dueText(summary?.next_due_date);

  return (
    <Card padding="lg">
      <BiText id="hisab.title" variant="title" tone="strong" style={styles.title} />

      {state === 'deactivated' ? <Banner id="hisab.deactivated" tone="danger" /> : null}
      {state === 'overdue' ? <Banner id="hisab.overdue" tone="warning" /> : null}
      {state === 'clear' ? <Banner id="hisab.clear" tone="success" /> : null}

      {state !== 'clear' && summary ? (
        <View style={styles.summary}>
          <Text style={styles.amount}>Rs {Number(summary.outstanding_pkr)}</Text>
          <BiText id="hisab.owed" variant="caption" tone="muted" />
          {due ? <Text style={styles.meta}>{due}</Text> : null}
          {Number(summary.overdue_pkr) > 0 ? <Text style={styles.overdue}>Overdue: Rs {Number(summary.overdue_pkr)}</Text> : null}
        </View>
      ) : null}

      {state !== 'clear' ? <BiText id="hisab.howToPay" variant="bodySm" tone="muted" style={styles.gap} /> : null}

      {entries.map((e) => (
        <View key={e.id} style={styles.row}>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {e.job_title}
            </Text>
            <Text style={styles.meta}>{`Rs ${e.order_amount_pkr} × ${e.commission_pct}% · due ${e.due_date}`}</Text>
          </View>
          <View style={styles.rowEnd}>
            <Text style={styles.rowAmount}>Rs {e.commission_pkr}</Text>
            <Chip label={ENTRY_LABEL[e.ledger_status]} tone={TONE[e.ledger_status]} />
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.md },
  gap: { marginBottom: spacing.md },
  summary: { marginBottom: spacing.md },
  amount: { ...typography.displayMd, color: colors.textStrong },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  overdue: { ...typography.label, color: colors.danger, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  rowBody: { flex: 1, marginRight: spacing.sm },
  rowTitle: { ...typography.subtitle, color: colors.textStrong },
  rowEnd: { alignItems: 'flex-end', gap: 4 },
  rowAmount: { ...typography.body, color: colors.textStrong },
});
