import { useRoute, type RouteProp } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { JobThread } from '../../components/JobThread';
import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import type { StringId } from '../../i18n/strings';
import { trackEvent } from '../../lib/analytics';
import { expiresIn, formatBudget, looksLikeContact } from '../../lib/jobPosting';
import { parseAmount } from '../../lib/jobPayments';
import { supabase } from '../../lib/supabase';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

import type { BoardJob } from './JobBoardScreen';

type BoardJobDetail = BoardJob & { status: string };

export default function BoardJobScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'BoardJob'>>();
  const { jobId } = route.params;
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const uid = session?.user.id ?? null;

  const [job, setJob] = useState<BoardJobDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [msg, setMsg] = useState<{ id?: StringId; text?: string; tone?: 'success' | 'warning' } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('get_board_job', { p_job_id: jobId });
    const row = ((Array.isArray(data) ? data[0] : data) ?? null) as BoardJobDetail | null;
    setJob(row);
    if (row?.my_quote_pkr != null) setAmount((a) => a || String(row.my_quote_pkr));
    setLoaded(true);
  }, [jobId]);

  useEffect(() => {
    load().catch(() => setLoaded(true));
  }, [load]);

  const sendQuote = async () => {
    const value = parseAmount(amount);
    if (value == null) {
      setMsg({ id: 'payment.invalid', tone: 'warning' });
      return;
    }
    if (looksLikeContact(message)) {
      setMsg({ id: 'thread.noContact', tone: 'warning' });
      return;
    }
    const { error } = await supabase.rpc('worker_quote_job', {
      p_job_id: jobId,
      p_amount_pkr: value,
      p_message: message.trim() || null,
    });
    if (error) {
      setMsg({ text: error.message, tone: 'warning' });
      return;
    }
    void trackEvent('job_quote_sent', uid, { job_id: jobId, amount_pkr: value });
    setMsg({ id: 'requests.done.quoted', tone: 'success' });
    await load();
  };

  if (loaded && !job) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Banner id="board.notAvailable" tone="warning" />
      </View>
    );
  }
  if (!job) return null;

  const budget = formatBudget(job.budget_min_pkr, job.budget_max_pkr);
  const left = expiresIn(job.expires_at);

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
      <Card padding="lg">
        <Text style={styles.title}>{job.title}</Text>
        <View style={styles.chips}>
          <Chip label={job.category} tone="neutral" icon="tag" />
          {job.city ? <Chip label={job.city} tone="neutral" icon="map" /> : null}
          {budget ? <Chip label={budget} tone="primary" icon="dollar-sign" /> : null}
          {job.preferred_time ? <Chip label={job.preferred_time} tone="neutral" icon="calendar" /> : null}
          {left ? <Chip label={left} tone="neutral" icon="clock" /> : null}
        </View>
        {job.description ? <Text style={styles.body}>{job.description}</Text> : null}
        {job.location_text ? <Text style={styles.meta}>{job.location_text}</Text> : null}
        <Banner id="board.privacy" tone="info" icon="lock" />
      </Card>

      <Card padding="lg">
        <BiText id="board.yourQuote" variant="title" tone="strong" style={styles.gap} />
        {job.my_quote_pkr != null ? <Banner text={`Your current quote: Rs ${job.my_quote_pkr}`} tone="info" /> : null}
        <Input labelId="requests.quoteAmount" value={amount} onChangeText={setAmount} keyboardType="numeric" iconLeft="dollar-sign" />
        <Input labelId="board.quoteMessage" value={message} onChangeText={setMessage} multiline />
        <Button labelId="requests.sendQuote" onPress={sendQuote} iconLeft="send" fullWidth />
        {msg ? msg.id ? <Banner id={msg.id} tone={msg.tone ?? 'info'} /> : <Banner text={msg.text} tone="warning" /> : null}
      </Card>

      {uid ? (
        <Card padding="lg">
          <BiText id="board.askTitle" variant="title" tone="strong" style={styles.gap} />
          <JobThread jobId={job.id} workerId={uid} viewer="worker" />
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1, gap: spacing.md },
  title: { ...typography.title, color: colors.textStrong },
  body: { ...typography.body, color: colors.textBody, marginTop: spacing.sm },
  meta: { ...typography.bodySm, color: colors.textMuted, marginTop: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  gap: { marginBottom: spacing.md },
});
