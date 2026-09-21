import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { JobThread } from '../../components/JobThread';
import { Avatar } from '../../components/ui/Avatar';
import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { useAuth } from '../../context/AuthContext';
import type { StringId } from '../../i18n/strings';
import {
  expiresIn,
  formatBudget,
  removeGuestJob,
  type JobQuote,
  type PostedJob,
} from '../../lib/jobPosting';
import { supabase } from '../../lib/supabase';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PostedJob'>;

const STATUS_TONE: Record<string, 'primary' | 'accent' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  open: 'warning',
  quoted: 'info',
  assigned: 'accent',
  cancelled: 'danger',
};

export default function PostedJobScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'PostedJob'>>();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const uid = session?.user.id ?? null;

  const [jobId, setJobId] = useState<string | undefined>(route.params.jobId);
  const [token, setToken] = useState<string | null>(route.params.token ?? null);
  const [job, setJob] = useState<PostedJob | null>(null);
  const [quotes, setQuotes] = useState<JobQuote[]>([]);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id?: StringId; text?: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    // A guest who has since signed in: attach the job to their account first.
    let currentJobId = jobId;
    let currentToken = token;
    if (uid && currentToken) {
      const { data, error } = await supabase.rpc('claim_guest_job', { p_token: currentToken });
      if (!error && data) {
        await removeGuestJob(currentToken);
        currentJobId = String(data);
        currentToken = null;
        setJobId(currentJobId);
        setToken(null);
        setMsg({ id: 'posted.claimed' });
      }
    }

    let row: PostedJob | null = null;
    if (currentToken) {
      const { data } = await supabase.rpc('get_guest_job', { p_token: currentToken });
      row = ((Array.isArray(data) ? data[0] : data) ?? null) as PostedJob | null;
    } else if (currentJobId) {
      const { data } = await supabase.from('jobs').select('*').eq('id', currentJobId).maybeSingle();
      row = (data ?? null) as PostedJob | null;
    }
    setJob(row);
    if (row) {
      const { data: q } = await supabase.rpc('job_quotes', { p_job_id: row.id, p_token: currentToken });
      setQuotes((q ?? []) as JobQuote[]);
    }
    setLoaded(true);
  }, [jobId, token, uid]);

  useEffect(() => {
    load().catch(() => setLoaded(true));
  }, [load]);

  const accept = async (quoteId: string) => {
    if (!uid) {
      setMsg({ id: 'posted.signInToAccept' });
      navigation.navigate('Auth');
      return;
    }
    const { error } = await supabase.rpc('customer_accept_quote', { p_quote_id: quoteId });
    if (error) {
      setMsg({ text: error.message });
      return;
    }
    setMsg({ id: 'requests.done.accepted' });
    await load();
  };

  const cancel = async () => {
    if (!job) return;
    const { error } = await supabase.rpc('cancel_posted_job', { p_job_id: job.id, p_token: token });
    if (error) setMsg({ text: error.message });
    else {
      setMsg({ id: 'requests.done.cancelled' });
      await load();
    }
  };

  if (loaded && !job) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Banner id="posted.notFound" tone="warning" />
      </View>
    );
  }

  const open = job?.status === 'open' || job?.status === 'quoted';
  const budget = job ? formatBudget(job.budget_min_pkr, job.budget_max_pkr) : null;
  const left = job ? expiresIn(job.expires_at) : null;

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
      {msg ? msg.id ? <Banner id={msg.id} tone="info" /> : <Banner text={msg.text} tone="warning" /> : null}

      {job ? (
        <Card padding="lg">
          <Text style={styles.title}>{job.title}</Text>
          <View style={styles.chips}>
            <Chip label={job.category} tone="neutral" icon="tag" />
            <Chip label={job.status} tone={STATUS_TONE[job.status] ?? 'neutral'} />
            {budget ? <Chip label={budget} tone="primary" icon="dollar-sign" /> : null}
            {left && open ? <Chip label={left} tone="neutral" icon="clock" /> : null}
          </View>
          {job.description ? <Text style={styles.body}>{job.description}</Text> : null}
          {job.city || job.location_text ? (
            <Text style={styles.meta}>{[job.location_text, job.city].filter(Boolean).join(', ')}</Text>
          ) : null}
          {token ? <Banner id="posted.guestKeep" tone="info" icon="user-plus" /> : null}
        </Card>
      ) : null}

      {job && open ? (
        <Card padding="lg">
          <BiText id="posted.quotes" variant="title" tone="strong" style={styles.gap} />
          {quotes.length === 0 ? (
            <BiText id="posted.noQuotes" variant="body" tone="muted" />
          ) : (
            quotes.map((q) => (
              <View key={q.quote_id} style={styles.quote}>
                <View style={styles.quoteHead}>
                  <Avatar name={q.worker_name} tone="primary" />
                  <View style={styles.quoteBody}>
                    <Text style={styles.qName}>{q.worker_name ?? 'Worker'}</Text>
                    <View style={styles.chips}>
                      {q.avg_rating != null ? <Chip label={`${Number(q.avg_rating).toFixed(1)} ★`} tone="warning" /> : null}
                      {q.is_verified ? <Chip label="Verified" tone="accent" icon="check-circle" /> : null}
                      {q.years_experience != null ? <Chip label={`${q.years_experience} yrs`} tone="neutral" /> : null}
                    </View>
                  </View>
                  <Text style={styles.qAmount}>Rs {q.amount_pkr}</Text>
                </View>
                {q.message ? <Text style={styles.meta}>{q.message}</Text> : null}
                <View style={styles.row}>
                  <Button labelId="posted.accept" onPress={() => accept(q.quote_id)} variant="success" iconLeft="check" size="sm" hideUrdu />
                  <Button
                    labelId="posted.ask"
                    onPress={() => setOpenThread(openThread === q.worker_id ? null : q.worker_id)}
                    variant="secondary"
                    iconLeft="message-circle"
                    size="sm"
                    hideUrdu
                  />
                </View>
                {openThread === q.worker_id && job ? (
                  <JobThread jobId={job.id} workerId={q.worker_id} token={token} viewer="customer" />
                ) : null}
              </View>
            ))
          )}
          <Button labelId="requests.cancel" onPress={cancel} variant="secondary" iconLeft="x" size="sm" hideUrdu style={styles.cancel} />
        </Card>
      ) : null}

      {job?.status === 'assigned' && uid && !token ? (
        <Button labelId="posted.openJob" onPress={() => navigation.navigate('JobDetail', { jobId: job.id })} iconLeft="arrow-right" fullWidth />
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
  quote: { paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  quoteHead: { flexDirection: 'row', alignItems: 'center' },
  quoteBody: { flex: 1, marginLeft: spacing.md },
  qName: { ...typography.subtitle, color: colors.textStrong },
  qAmount: { ...typography.title, color: colors.primaryDeep },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  cancel: { marginTop: spacing.md },
});
