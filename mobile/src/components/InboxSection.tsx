import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import type { StringId } from '../i18n/strings';
import { fetchDirectRequestFlags } from '../lib/directRequests';
import {
  buildInbox,
  countByBucket,
  FLOW_LABEL,
  filterInbox,
  statusLabel,
  type ApplicationRaw,
  type InboxFilter,
  type InboxItem,
  type JobRaw,
  type MyQuoteRaw,
} from '../lib/inbox';
import { supabase } from '../lib/supabase';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { RequestRow, type RequestJob, type RequestQuote } from './RequestRow';
import { Avatar } from './ui/Avatar';
import { Banner } from './ui/Banner';
import { BiText } from './ui/BiText';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Chip } from './ui/Chip';
import { Icon } from './ui/Icon';

type Props = { userId: string; role: 'worker' | 'customer' };
type RpcResult = PromiseLike<{ error: { message: string } | null }>;
type Msg = { id?: StringId; text?: string } | null;

const FILTERS: Array<{ key: InboxFilter; labelId: StringId }> = [
  { key: 'all', labelId: 'inbox.filter.all' },
  { key: 'pending', labelId: 'inbox.filter.pending' },
  { key: 'active', labelId: 'inbox.filter.active' },
  { key: 'done', labelId: 'inbox.filter.done' },
];

const TONE: Record<string, 'primary' | 'accent' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  pending: 'warning',
  open: 'warning',
  quoted: 'info',
  pending_customer_confirm: 'warning',
  accepted: 'accent',
  assigned: 'primary',
  completed: 'accent',
  payment_pending: 'warning',
  closed: 'accent',
  disputed: 'danger',
  declined: 'danger',
  cancelled: 'danger',
  rejected: 'neutral',
};

/**
 * One inbox for everything: service applications, direct requests, posted jobs
 * and quotes, for both roles, with the same status chips and Pending / Active /
 * Done filters. Rows that need an answer carry their actions inline.
 */
export function InboxSection({ userId, role }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [jobs, setJobs] = useState<Record<string, RequestJob>>({});
  const [quotes, setQuotes] = useState<RequestQuote[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(true);
  const [directEnabled, setDirectEnabled] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(async () => {
    const applications: Array<{ row: ApplicationRaw; listingTitle?: string }> = [];
    let jobRows: JobRaw[] = [];
    let myQuotes: MyQuoteRaw[] = [];

    if (role === 'worker') {
      const { data: listings } = await supabase.from('worker_service_listings').select('id,headline').eq('worker_id', userId);
      const titles: Record<string, string> = {};
      ((listings ?? []) as Array<{ id: string; headline: string }>).forEach((l) => {
        titles[l.id] = l.headline;
      });
      const ids = Object.keys(titles);
      if (ids.length > 0) {
        const { data } = await supabase
          .from('listing_applications')
          .select('*')
          .in('listing_id', ids)
          .order('created_at', { ascending: false });
        ((data ?? []) as ApplicationRaw[]).forEach((row) => applications.push({ row, listingTitle: titles[row.listing_id] }));
      }
      const { data: jr } = await supabase
        .from('jobs')
        .select('*')
        .or(`target_worker_id.eq.${userId},worker_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(50);
      jobRows = (jr ?? []) as JobRaw[];
      const { data: mq } = await supabase.rpc('list_my_quotes', { p_limit: 50 });
      myQuotes = (mq ?? []) as MyQuoteRaw[];
    } else {
      const { data } = await supabase
        .from('listing_applications')
        .select('*')
        .eq('customer_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      const rows = (data ?? []) as ApplicationRaw[];
      let titles: Record<string, string> = {};
      if (rows.length > 0) {
        const { data: ls } = await supabase
          .from('worker_service_listings')
          .select('id,headline')
          .in('id', Array.from(new Set(rows.map((r) => r.listing_id))));
        titles = Object.fromEntries(((ls ?? []) as Array<{ id: string; headline: string }>).map((l) => [l.id, l.headline]));
      }
      rows.forEach((row) => applications.push({ row, listingTitle: titles[row.listing_id] }));
      const { data: jr } = await supabase
        .from('jobs')
        .select('*')
        .eq('customer_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      jobRows = (jr ?? []) as JobRaw[];
    }

    setItems(buildInbox({ applications, jobs: jobRows, quotes: myQuotes }));
    const byId: Record<string, RequestJob> = {};
    jobRows.forEach((j) => {
      byId[j.id] = j as unknown as RequestJob;
    });
    setJobs(byId);

    // Pending quotes shown on the customer's open requests.
    const openIds = jobRows.filter((j) => ['open', 'quoted'].includes(j.status)).map((j) => j.id);
    if (role === 'customer' && openIds.length > 0) {
      const { data: q } = await supabase
        .from('quotes')
        .select('id,job_id,amount_pkr,message,status')
        .in('job_id', openIds)
        .eq('status', 'pending');
      setQuotes((q ?? []) as RequestQuote[]);
    } else {
      setQuotes([]);
    }

    const personIds = Array.from(
      new Set(jobRows.flatMap((r) => [r.target_worker_id, r.worker_id, r.customer_id]).filter(Boolean) as string[])
    );
    if (personIds.length > 0) {
      const { data: p } = await supabase.from('profiles').select('id,display_name').in('id', personIds);
      const map: Record<string, string> = {};
      ((p ?? []) as Array<{ id: string; display_name: string | null }>).forEach((x) => {
        map[x.id] = x.display_name ?? '';
      });
      setNames(map);
    }

    if (role === 'worker') {
      const { data: wp } = await supabase.from('worker_profiles').select('is_available').eq('user_id', userId).maybeSingle();
      if (wp && typeof wp.is_available === 'boolean') setAvailable(wp.is_available);
    }
    setLoaded(true);
  }, [role, userId]);

  useEffect(() => {
    load().catch(() => {
      setMsg({ id: 'applications.error.load' });
      setLoaded(true);
    });
    fetchDirectRequestFlags().then((f) => setDirectEnabled(f.enabled));
  }, [load]);

  const run = async (fn: () => RpcResult, done: StringId) => {
    const { error } = await fn();
    if (error) setMsg({ text: error.message });
    else {
      setMsg({ id: done });
      await load();
    }
  };

  const toggleAvailability = async (value: boolean) => {
    setAvailable(value);
    const { error } = await supabase.rpc('worker_set_availability', { p_available: value });
    if (error) {
      setAvailable(!value);
      setMsg({ text: error.message });
    }
  };

  const counts = useMemo(() => countByBucket(items), [items]);
  const visible = useMemo(() => filterInbox(items, filter), [items, filter]);

  const renderItem = (item: InboxItem) => {
    if (item.kind === 'request' && item.jobId && jobs[item.jobId]) {
      const j = jobs[item.jobId];
      return (
        <RequestRow
          key={item.key}
          job={j}
          mode={role}
          counterpart={names[role === 'worker' ? (j.customer_id ?? '') : (j.worker_id ?? j.target_worker_id ?? '')] ?? ''}
          quotes={quotes.filter((q) => q.job_id === j.id)}
          onAcceptBudget={() => run(() => supabase.rpc('worker_accept_direct_request', { p_job_id: j.id }), 'requests.done.accepted')}
          onQuote={(amount) =>
            run(() => supabase.rpc('worker_quote_direct_request', { p_job_id: j.id, p_amount_pkr: amount }), 'requests.done.quoted')
          }
          onDecline={() => run(() => supabase.rpc('worker_decline_direct_request', { p_job_id: j.id }), 'requests.done.declined')}
          onAcceptQuote={(quoteId) => run(() => supabase.rpc('customer_accept_quote', { p_quote_id: quoteId }), 'requests.done.accepted')}
          onCancel={() => run(() => supabase.rpc('customer_cancel_job', { job_id: j.id }), 'requests.done.cancelled')}
          onView={() => navigation.navigate('PostedJob', { jobId: j.id })}
        />
      );
    }

    const open = () => {
      if (item.kind === 'job' && item.jobId) navigation.navigate('JobDetail', { jobId: item.jobId });
      else if (item.kind === 'quote' && item.jobId && item.bucket === 'pending') navigation.navigate('BoardJob', { jobId: item.jobId });
    };
    const tappable = item.kind === 'job' || (item.kind === 'quote' && item.bucket === 'pending');
    const applicationId = item.kind === 'application' ? item.key.slice(4) : null;

    return (
      <Pressable key={item.key} onPress={open} disabled={!tappable} accessibilityRole={tappable ? 'button' : undefined} style={styles.row}>
        <Avatar name={item.title} tone="primary" />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text style={styles.meta} numberOfLines={2}>
              {item.subtitle}
            </Text>
          ) : null}
          <View style={styles.chips}>
            <Chip label={FLOW_LABEL[item.flow]} tone="neutral" />
            <Chip label={statusLabel(item.status)} tone={TONE[item.status] ?? 'neutral'} />
          </View>
          {role === 'worker' && applicationId && item.status === 'pending' ? (
            <View style={styles.buttonRow}>
              <Button
                labelId="applications.accept"
                onPress={() => run(() => supabase.rpc('worker_accept_listing_application', { application_id: applicationId }), 'applications.acceptToast')}
                variant="success"
                iconLeft="check"
                size="sm"
                hideUrdu
              />
              <Button
                labelId="applications.decline"
                onPress={() => run(() => supabase.rpc('worker_decline_listing_application', { application_id: applicationId }), 'applications.declineToast')}
                variant="secondary"
                iconLeft="x"
                size="sm"
                hideUrdu
              />
            </View>
          ) : null}
        </View>
        {tappable ? <Icon name="chevron-right" size={18} color={colors.textMuted} /> : null}
      </Pressable>
    );
  };

  return (
    <Card padding="lg">
      {role === 'worker' && directEnabled ? (
        <View style={styles.availRow}>
          <BiText id="requests.available" variant="body" tone="body" style={styles.availLabel} />
          <Switch value={available} onValueChange={toggleAvailability} trackColor={{ true: colors.primary, false: colors.border }} />
        </View>
      ) : null}

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f.key }}
            style={[styles.pill, filter === f.key && styles.pillOn]}
          >
            <BiText id={f.labelId} hideUrdu variant="label" tone={filter === f.key ? 'inverse' : 'body'} />
            <Text style={[styles.count, filter === f.key && styles.countOn]}>{counts[f.key]}</Text>
          </Pressable>
        ))}
      </View>

      {msg ? msg.id ? <Banner id={msg.id} tone="info" /> : <Banner text={msg.text} tone="warning" /> : null}

      {loaded && visible.length === 0 ? (
        <BiText id="inbox.empty" variant="body" tone="muted" align="center" style={styles.empty} />
      ) : (
        visible.map(renderItem)
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  availRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  availLabel: { flex: 1, marginRight: spacing.md },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  count: { ...typography.caption, color: colors.textMuted },
  countOn: { color: colors.primaryInk },
  empty: { paddingVertical: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  body: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  title: { ...typography.subtitle, color: colors.textStrong },
  meta: { ...typography.bodySm, color: colors.textMuted, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});
