import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text } from 'react-native';

import type { StringId } from '../i18n/strings';
import { dialableHelpline, fetchHelpline, parseAmount, paymentStep } from '../lib/jobPayments';
import { supabase } from '../lib/supabase';
import { colors, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { Banner } from './ui/Banner';
import { BiText } from './ui/BiText';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';

type Props = {
  jobId: string;
  status: string;
  isCustomer: boolean;
  isWorker: boolean;
  /** Suggested amount (e.g. the accepted quote). */
  suggestedAmount?: number | null;
  onChanged?: () => void;
};

/**
 * Cash payment: customer marks paid, worker confirms the amount received, job closes.
 * A mismatch, or a worker who never confirms, becomes a dispute handled by the helpline.
 */
export function JobPaymentSection({ jobId, status, isCustomer, isWorker, suggestedAmount, onChanged }: Props) {
  const step = paymentStep(status, isCustomer, isWorker);
  const [amount, setAmount] = useState(suggestedAmount != null ? String(suggestedAmount) : '');
  const [helpline, setHelpline] = useState('');
  const [msg, setMsg] = useState<{ id?: StringId; text?: string; tone?: 'success' | 'warning' } | null>(null);

  useEffect(() => {
    if (suggestedAmount != null) setAmount((a) => a || String(suggestedAmount));
  }, [suggestedAmount]);

  useEffect(() => {
    if (step === 'disputed') fetchHelpline().then(setHelpline);
  }, [step]);

  if (step === 'none') return null;

  const parsed = parseAmount(amount);

  const markPaid = async () => {
    if (parsed == null) {
      setMsg({ id: 'payment.invalid', tone: 'warning' });
      return;
    }
    const { error } = await supabase.rpc('mark_job_paid', {
      p_job_id: jobId,
      p_amount: parsed,
      p_method: 'cash',
      p_note: null,
    });
    if (error) setMsg({ text: error.message, tone: 'warning' });
    else {
      setMsg({ id: 'payment.markedPaid', tone: 'success' });
      onChanged?.();
    }
  };

  const confirmReceived = async () => {
    if (parsed == null) {
      setMsg({ id: 'payment.invalid', tone: 'warning' });
      return;
    }
    const { data, error } = await supabase.rpc('worker_confirm_payment_received', {
      p_job_id: jobId,
      p_received_amount: parsed,
    });
    if (error) setMsg({ text: error.message, tone: 'warning' });
    else {
      setMsg(data === 'disputed' ? { id: 'payment.mismatch', tone: 'warning' } : { id: 'payment.closedToast', tone: 'success' });
      onChanged?.();
    }
  };

  const number = dialableHelpline(helpline);

  return (
    <Card padding="lg">
      <BiText id="payment.title" variant="title" tone="strong" style={styles.title} />

      {step === 'customer_pay' && (
        <>
          <BiText id="payment.customerPay" variant="bodySm" tone="muted" style={styles.gap} />
          <Input
            labelId="payment.amountPaid"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            iconLeft="dollar-sign"
          />
          <Button labelId="payment.markPaid" onPress={markPaid} variant="success" iconLeft="check" fullWidth />
        </>
      )}

      {step === 'customer_wait' && <Banner id="payment.customerWait" tone="info" />}

      {step === 'worker_wait' && <Banner id="payment.workerWait" tone="info" />}

      {step === 'worker_confirm' && (
        <>
          <BiText id="payment.workerConfirm" variant="bodySm" tone="muted" style={styles.gap} />
          <Input
            labelId="payment.amountReceived"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            iconLeft="dollar-sign"
          />
          <Button labelId="payment.confirmReceived" onPress={confirmReceived} variant="success" iconLeft="check" fullWidth />
        </>
      )}

      {step === 'closed' && <Banner id="payment.closed" tone="success" />}

      {step === 'disputed' && (
        <>
          <Banner id="payment.disputed" tone="warning" />
          <Text style={styles.helpline}>{helpline || '…'}</Text>
          {number ? (
            <Button
              labelId="payment.callHelpline"
              onPress={() => Linking.openURL(`tel:${number}`).catch(() => {})}
              iconLeft="phone"
              fullWidth
            />
          ) : null}
        </>
      )}

      {msg ? msg.id ? <Banner id={msg.id} tone={msg.tone ?? 'info'} /> : <Banner text={msg.text} tone="warning" /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.md },
  gap: { marginBottom: spacing.md },
  helpline: { ...typography.subtitle, color: colors.textStrong, marginVertical: spacing.md },
});
