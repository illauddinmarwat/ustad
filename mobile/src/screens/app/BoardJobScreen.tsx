import { useRoute, type RouteProp } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { JobMediaGallery } from '../../components/JobMediaGallery';
import { QuoteFields } from '../../components/QuoteFields';
import { TypicalPriceHint } from '../../components/TypicalPriceHint';
import { VoiceRecorder } from '../../components/VoiceRecorder';
import { JobThread } from '../../components/JobThread';
import { QuotePricePreview } from '../../components/QuotePricePreview';
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
import {
  availabilityDate,
  fetchQuoteUpgradesEnabled,
  type AvailabilityKey,
  type PriceType,
} from '../../lib/quoteDetails';
import { attachQuoteVoice, QUOTE_VOICE_SECONDS } from '../../lib/quoteVoice';
import { LocalizedText } from '../../components/LocalizedText';
import { loadJobTranslations, type JobTranslation } from '../../lib/jobTranslations';
import { supabase } from '../../lib/supabase';
import type { VoiceNote } from '../../lib/voiceNote';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

import type { BoardJob } from './JobBoardScreen';

type BoardJobDetail = BoardJob & { status: string; my_customer_price_pkr?: number | null };

export default function BoardJobScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'BoardJob'>>();
  const { jobId } = route.params;
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const uid = session?.user.id ?? null;

  const [job, setJob] = useState<BoardJobDetail | null>(null);
  const [translation, setTranslation] = useState<JobTranslation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [detailed, setDetailed] = useState(false);
  const [voice, setVoice] = useState<VoiceNote | null>(null);
  const [priceType, setPriceType] = useState<PriceType>('fixed');
  const [availability, setAvailability] = useState<AvailabilityKey | null>(null);
  const [msg, setMsg] = useState<{ id?: StringId; text?: string; tone?: 'success' | 'warning' } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('get_board_job', { p_job_id: jobId });
    const row = ((Array.isArray(data) ? data[0] : data) ?? null) as BoardJobDetail | null;
    setJob(row);
    if (row) setTranslation((await loadJobTranslations([row.id]))[row.id] ?? null);
    if (row?.my_quote_pkr != null) setAmount((a) => a || String(row.my_quote_pkr));
    setLoaded(true);
  }, [jobId]);

  useEffect(() => {
    load().catch(() => setLoaded(true));
  }, [load]);

  useEffect(() => {
    fetchQuoteUpgradesEnabled().then(setDetailed);
  }, []);

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
    if (detailed && !availability) {
      setMsg({ id: 'quote.needDate', tone: 'warning' });
      return;
    }
    const { data: quoteId, error } = detailed
      ? await supabase.rpc('worker_send_quote', {
          p_job_id: jobId,
          p_amount_pkr: value,
          p_message: message.trim() || null,
          p_price_type: priceType,
          p_available_from: availabilityDate(availability as AvailabilityKey),
        })
      : await supabase.rpc('worker_quote_job', {
          p_job_id: jobId,
          p_amount_pkr: value,
          p_message: message.trim() || null,
        });
    if (error) {
      setMsg({ text: error.message, tone: 'warning' });
      return;
    }
    void trackEvent('job_quote_sent', uid, { job_id: jobId, amount_pkr: value, voice: !!voice });
    if (detailed && voice && uid && typeof quoteId === 'string') {
      const voiceError = await attachQuoteVoice(uid, jobId, quoteId, voice);
      if (voiceError) {
        setMsg({ id: 'quote.voiceFailed', tone: 'warning' });
        await load();
        return;
      }
      setVoice(null);
    }
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
        <LocalizedText original={job.title} i18n={translation?.title_i18n} style={styles.title} />
        <View style={styles.chips}>
          <Chip label={job.category} tone="neutral" icon="tag" />
          {job.city ? <Chip label={job.city} tone="neutral" icon="map" /> : null}
          {budget ? <Chip label={budget} tone="primary" icon="dollar-sign" /> : null}
          {job.preferred_time ? <Chip label={job.preferred_time} tone="neutral" icon="calendar" /> : null}
          {left ? <Chip label={left} tone="neutral" icon="clock" /> : null}
        </View>
        {job.description ? <LocalizedText original={job.description} i18n={translation?.description_i18n} style={styles.body} /> : null}
        {job.location_text ? <Text style={styles.meta}>{job.location_text}</Text> : null}
        <Banner id="board.privacy" tone="info" icon="lock" />
      </Card>

      <JobMediaGallery jobId={job.id} />

      <Card padding="lg">
        <BiText id="board.yourQuote" variant="title" tone="strong" style={styles.gap} />
        {job.my_quote_pkr != null ? (
          <Banner
            text={
              job.my_customer_price_pkr != null && job.my_customer_price_pkr !== job.my_quote_pkr
                ? `Your current quote: Rs ${job.my_quote_pkr} (the customer sees Rs ${job.my_customer_price_pkr})`
                : `Your current quote: Rs ${job.my_quote_pkr}`
            }
            tone="info"
          />
        ) : null}
        <TypicalPriceHint category={job.category} city={job.city} />
        <Input labelId="requests.quoteAmount" value={amount} onChangeText={setAmount} keyboardType="numeric" iconLeft="dollar-sign" />
        <QuotePricePreview amount={amount} />
        <Input labelId="board.quoteMessage" value={message} onChangeText={setMessage} multiline />
        {detailed ? (
          <QuoteFields
            priceType={priceType}
            onPriceType={setPriceType}
            availability={availability}
            onAvailability={setAvailability}
          />
        ) : null}
        {detailed ? (
          <VoiceRecorder value={voice} onChange={setVoice} maxSeconds={QUOTE_VOICE_SECONDS} hintId="quote.voiceHint" />
        ) : null}
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
