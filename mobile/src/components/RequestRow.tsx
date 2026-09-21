import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { canAcceptAsIs, requestStatusLabel } from '../lib/directRequests';
import { colors, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Chip } from './ui/Chip';
import { Input } from './ui/Input';

export type RequestJob = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  budget_pkr: number | null;
  preferred_time: string | null;
  location_text: string | null;
  target_worker_id: string | null;
  worker_id: string | null;
  customer_id: string | null;
};

export type RequestQuote = { id: string; job_id: string; amount_pkr: number; message: string | null; status: string };

export type RequestRowProps = {
  job: RequestJob;
  mode: 'worker' | 'customer';
  counterpart: string;
  quotes: RequestQuote[];
  onAcceptBudget: () => void;
  onQuote: (amount: number) => void;
  onDecline: () => void;
  onAcceptQuote: (quoteId: string) => void;
  onCancel: () => void;
  onView: () => void;
};

const TONE: Record<string, 'primary' | 'accent' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  open: 'warning',
  quoted: 'info',
  assigned: 'accent',
  completed: 'accent',
  cancelled: 'danger',
};

/** A direct request or posted job that still needs an answer, with the actions for the viewer's side. */
export function RequestRow({
  job,
  mode,
  counterpart,
  quotes,
  onAcceptBudget,
  onQuote,
  onDecline,
  onAcceptQuote,
  onCancel,
  onView,
}: RequestRowProps) {
  const [amount, setAmount] = useState('');
  const isOpen = job.status === 'open' || job.status === 'quoted';
  const amountNum = Number(amount);
  const validAmount = amount.trim() !== '' && Number.isFinite(amountNum) && amountNum >= 0;

  return (
    <View style={styles.row}>
      <Avatar name={counterpart || job.title} tone="primary" />
      <View style={styles.body}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {job.title}
        </Text>
        {counterpart ? <Text style={styles.meta}>{counterpart}</Text> : null}
        {job.description ? <Text style={styles.meta}>{job.description}</Text> : null}
        <View style={styles.chips}>
          <Chip
            label={requestStatusLabel(job.status, job.target_worker_id != null)}
            tone={TONE[job.status] ?? 'neutral'}
          />
          {job.budget_pkr != null ? <Chip label={`Rs ${job.budget_pkr}`} tone="primary" icon="dollar-sign" /> : null}
          {job.preferred_time ? <Chip label={job.preferred_time} tone="neutral" icon="calendar" /> : null}
        </View>

        {mode === 'worker' && isOpen && (
          <View style={styles.actions}>
            {canAcceptAsIs(job.budget_pkr) && (
              <Button
                labelId="requests.acceptBudget"
                onPress={onAcceptBudget}
                variant="success"
                iconLeft="check"
                size="sm"
                hideUrdu
              />
            )}
            <Input
              labelId="requests.quoteAmount"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              iconLeft="dollar-sign"
            />
            <View style={styles.buttonRow}>
              <Button
                labelId="requests.sendQuote"
                onPress={() => onQuote(amountNum)}
                iconLeft="send"
                size="sm"
                hideUrdu
                disabled={!validAmount}
              />
              <Button labelId="requests.decline" onPress={onDecline} variant="secondary" iconLeft="x" size="sm" hideUrdu />
            </View>
          </View>
        )}

        {mode === 'customer' && isOpen && (
          <View style={styles.actions}>
            {quotes.map((q) => (
              <View key={q.id} style={styles.quote}>
                <Text style={styles.rowTitle}>Rs {q.amount_pkr}</Text>
                {q.message ? <Text style={styles.meta}>{q.message}</Text> : null}
                <Button
                  labelId="requests.acceptQuote"
                  onPress={() => onAcceptQuote(q.id)}
                  variant="success"
                  iconLeft="check"
                  size="sm"
                  hideUrdu
                />
              </View>
            ))}
            {job.target_worker_id == null ? (
              <Button labelId="posted.quotes" onPress={onView} variant="secondary" iconLeft="list" size="sm" hideUrdu />
            ) : null}
            <Button labelId="requests.cancel" onPress={onCancel} variant="secondary" iconLeft="x" size="sm" hideUrdu />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  body: { flex: 1, marginLeft: spacing.md },
  rowTitle: { ...typography.subtitle, color: colors.textStrong },
  meta: { ...typography.bodySm, color: colors.textMuted, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  actions: { marginTop: spacing.md, gap: spacing.sm },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  quote: { gap: spacing.xs, paddingVertical: spacing.xs },
});
