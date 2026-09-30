import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fetchFinalPrice, proposeFinalPrice, respondFinalPrice, type FinalPriceInfo } from '../lib/finalPrice';
import { parseAmount } from '../lib/jobPayments';
import { colors, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { QuotePricePreview } from './QuotePricePreview';
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
  onChanged?: () => void;
  /** Tells the parent the agreed customer price once confirmed (null before), to pre-fill the payment. */
  onAgreed?: (customerPrice: number | null) => void;
};

/**
 * The final price of an estimate job: the Ustad proposes their own price after inspecting the job, the customer
 * accepts or declines, and payment waits for the agreed price. Renders nothing for fixed-price jobs.
 */
export function FinalPriceSection({ jobId, status, isCustomer, isWorker, onChanged, onAgreed }: Props) {
  const [info, setInfo] = useState<FinalPriceInfo | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await fetchFinalPrice(jobId);
    setInfo(next);
    onAgreed?.(next?.status === 'confirmed' ? next.customerPrice : null);
  }, [jobId, onAgreed]);

  useEffect(() => {
    if (isCustomer || isWorker) void load();
  }, [load, isCustomer, isWorker, status]);

  if (!info || !info.isEstimate || (!isCustomer && !isWorker)) return null;
  const open = status === 'assigned' || status === 'completed';

  const run = async (task: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    const message = await task();
    setBusy(false);
    if (message) setError(message);
    else {
      setAmount('');
      await load();
      onChanged?.();
    }
  };

  const send = () => {
    const value = parseAmount(amount);
    if (value == null) {
      setError('Enter a valid amount.');
      return;
    }
    void run(() => proposeFinalPrice(jobId, value));
  };

  return (
    <Card padding="lg">
      <BiText id="final.title" variant="title" tone="strong" style={styles.gap} />

      {info.status === 'confirmed' ? (
        <Banner text={`Agreed final price: Rs ${info.customerPrice ?? info.amount}`} tone="success" icon="check-circle" />
      ) : null}

      {isCustomer && info.status === 'none' ? <BiText id="final.customerWaiting" variant="body" tone="muted" /> : null}
      {isCustomer && info.status === 'declined' ? <BiText id="final.customerDeclined" variant="body" tone="muted" /> : null}
      {isCustomer && info.status === 'proposed' && open ? (
        <View>
          <Text style={styles.price}>Rs {info.amount}</Text>
          <BiText id="final.customerAsk" variant="body" tone="muted" style={styles.gap} />
          <View style={styles.row}>
            <Button labelId="final.accept" onPress={() => run(() => respondFinalPrice(jobId, true))} variant="success" iconLeft="check" size="sm" hideUrdu disabled={busy} />
            <Button labelId="final.decline" onPress={() => run(() => respondFinalPrice(jobId, false))} variant="secondary" iconLeft="x" size="sm" hideUrdu disabled={busy} />
          </View>
        </View>
      ) : null}

      {isWorker && info.status === 'proposed' ? (
        <View>
          <Text style={styles.price}>Rs {info.amount}</Text>
          <BiText id="final.workerWaiting" variant="body" tone="muted" />
        </View>
      ) : null}
      {isWorker && (info.status === 'none' || info.status === 'declined') && open ? (
        <View>
          {info.status === 'declined' ? <Banner id="final.workerDeclined" tone="warning" /> : null}
          <BiText id="final.workerAsk" variant="body" tone="muted" style={styles.gap} />
          <Input labelId="final.yourPrice" value={amount} onChangeText={setAmount} keyboardType="numeric" iconLeft="dollar-sign" />
          <QuotePricePreview amount={amount} />
          <Button labelId="final.send" onPress={send} iconLeft="send" fullWidth disabled={busy} loading={busy} />
        </View>
      ) : null}

      {error ? <Banner text={error} tone="warning" /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  price: { ...typography.title, color: colors.primaryDeep, marginBottom: spacing.sm },
});
