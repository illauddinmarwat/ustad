import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { JobThread } from '../../components/JobThread';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { KeyboardAvoid } from '../../components/ui/KeyboardAvoid';
import { useAuth } from '../../context/AuthContext';
import type { JobQuote } from '../../lib/jobPosting';
import { fetchNotifications, markNotificationsRead } from '../../lib/notifications';
import { supabase } from '../../lib/supabase';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type Nav = NativeStackNavigationProp<RootStackParamList, 'JobChat'>;

type Chat = {
  viewer: 'customer' | 'worker';
  workerId: string;
  title: string;
  /** Who the other person is (the Ustad's name, for the customer). */
  other: string | null;
  amount: number | null;
  /** Ustads who quoted, so the customer can switch conversations. */
  others: Array<{ workerId: string; name: string | null }>;
};

const OPEN = ['open', 'quoted'];

/**
 * The conversation before a quote is accepted, as its own screen: the job and quote stay pinned above, messages
 * fill the middle and the composer sits above the keyboard. Notifications land here and it works out who the
 * conversation is with, so the same link works for the Ustad and the customer. Once a job is assigned, the
 * conversation moves on to the job page.
 */
export default function JobChatScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'JobChat'>>();
  const { jobId, token } = route.params;
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const uid = session?.user.id ?? null;

  const [chat, setChat] = useState<Chat | null>(null);
  const [workerId, setWorkerId] = useState<string | undefined>(route.params.workerId);
  const [closed, setClosed] = useState(false);

  const resolve = useCallback(async () => {
    // Customer: signed in, or a guest holding the job's token.
    let customerJob: { title: string; status: string } | null = null;
    if (token) {
      const { data } = await supabase.rpc('get_guest_job', { p_token: token });
      customerJob = ((Array.isArray(data) ? data[0] : data) ?? null) as typeof customerJob;
    } else if (uid) {
      const { data } = await supabase
        .from('jobs')
        .select('title,status,customer_id,worker_id')
        .eq('id', jobId)
        .maybeSingle();
      const row = data as { title: string; status: string; customer_id: string; worker_id: string | null } | null;
      if (row && row.customer_id === uid) customerJob = row;
      else if (row && row.worker_id === uid && !OPEN.includes(row.status)) {
        navigation.replace('JobDetail', { jobId });
        return;
      }
    }

    if (customerJob) {
      if (!OPEN.includes(customerJob.status)) {
        if (token) setClosed(true);
        else navigation.replace('JobDetail', { jobId });
        return;
      }
      const { data: q } = await supabase.rpc('job_quotes', { p_job_id: jobId, p_token: token ?? null });
      const quotes = (q ?? []) as JobQuote[];
      let target = workerId;
      if (!target && quotes.length > 0) {
        // No one named (a notification): open the conversation with the newest message.
        const threads = await Promise.all(
          quotes.map(async (qt) => {
            const { data: t } = await supabase.rpc('list_thread', {
              p_job_id: jobId,
              p_worker_id: qt.worker_id,
              p_token: token ?? null,
            });
            const last = ((t ?? []) as Array<{ created_at: string }>).at(-1)?.created_at ?? '';
            return { id: qt.worker_id, last };
          }),
        );
        target = threads.sort((a, b) => b.last.localeCompare(a.last))[0].id;
      }
      const quote = quotes.find((qt) => qt.worker_id === target);
      if (!target || !quote) {
        setClosed(true);
        return;
      }
      setWorkerId(target);
      setChat({
        viewer: 'customer',
        workerId: target,
        title: customerJob.title,
        other: quote.worker_name,
        amount: Number(quote.amount_pkr),
        others: quotes.map((qt) => ({ workerId: qt.worker_id, name: qt.worker_name })),
      });
      return;
    }

    // Ustad: the conversation is always with the poster.
    if (!uid) {
      setClosed(true);
      return;
    }
    const { data } = await supabase.rpc('get_board_job', { p_job_id: jobId });
    const row = ((Array.isArray(data) ? data[0] : data) ?? null) as
      | { title: string; my_quote_pkr?: number | null }
      | null;
    if (!row) {
      setClosed(true);
      return;
    }
    setChat({
      viewer: 'worker',
      workerId: uid,
      title: row.title,
      other: null,
      amount: row.my_quote_pkr != null ? Number(row.my_quote_pkr) : null,
      others: [],
    });
  }, [jobId, token, uid, workerId, navigation]);

  useEffect(() => {
    resolve().catch(() => setClosed(true));
  }, [resolve]);

  // Opening the conversation clears its message notifications.
  const chatReady = !!chat;
  useEffect(() => {
    if (!uid || !chatReady) return;
    fetchNotifications()
      .then((rows) => {
        const ids = rows.filter((n) => n.kind === 'thread_message' && n.job_id === jobId && !n.read_at).map((n) => n.id);
        return ids.length > 0 ? markNotificationsRead(ids) : undefined;
      })
      .catch(() => undefined);
  }, [uid, jobId, chatReady]);

  if (closed) {
    return (
      <View style={[styles.root, { padding: spacing.lg }]}>
        <Banner id="chat.closed" tone="warning" />
      </View>
    );
  }
  if (!chat) return <View style={styles.root} />;

  return (
    <KeyboardAvoid style={styles.root}>
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={1}>
          {chat.title}
        </Text>
        <View style={styles.chips}>
          <Chip label={chat.other ?? (chat.viewer === 'worker' ? 'Customer' : 'Ustad')} tone="neutral" icon="user" />
          {chat.amount != null ? <Chip label={`Rs ${chat.amount}`} tone="primary" icon="dollar-sign" /> : null}
        </View>
        {chat.others.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switcher}>
            {chat.others.map((o) => (
              <Pressable key={o.workerId} onPress={() => setWorkerId(o.workerId)} accessibilityRole="button">
                <Chip label={o.name ?? 'Ustad'} tone={o.workerId === chat.workerId ? 'primary' : 'neutral'} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <Button
          labelId={chat.viewer === 'worker' ? 'chat.viewJob' : 'chat.viewQuote'}
          onPress={() =>
            chat.viewer === 'worker'
              ? navigation.navigate('BoardJob', { jobId })
              : navigation.navigate('PostedJob', { jobId, token })
          }
          variant="ghost"
          size="sm"
          hideUrdu
        />
      </View>
      <JobThread key={chat.workerId} jobId={jobId} workerId={chat.workerId} token={token} viewer={chat.viewer} />
      <View style={{ height: insets.bottom }} />
    </KeyboardAvoid>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: {
    padding: spacing.md,
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: { ...typography.title, color: colors.textStrong },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  switcher: { gap: 6 },
});
