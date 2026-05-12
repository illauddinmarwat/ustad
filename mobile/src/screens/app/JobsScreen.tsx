import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { Input } from '../../components/ui/Input';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useAuth } from '../../context/AuthContext';
import type { StringId } from '../../i18n/strings';
import { trackEvent } from '../../lib/analytics';
import { ensureAuthenticated, ensureRole } from '../../lib/authGuards';
import { supabase } from '../../lib/supabase';
import type { RootStackParamList, TabParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type Job = {
  id: string;
  title: string;
  status: string;
  origin: string;
  customer_id: string;
  worker_id: string | null;
};

type JobsNav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Jobs'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type Msg = { kind: 'id'; id: StringId } | { kind: 'text'; text: string } | null;

const STATUS_TONE: Record<string, 'primary' | 'accent' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  open: 'info',
  assigned: 'primary',
  in_progress: 'warning',
  completed: 'accent',
  cancelled: 'danger',
};

export default function JobsScreen() {
  const navigation = useNavigation<JobsNav>();
  const { role, session } = useAuth();
  const insets = useSafeAreaInsets();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobTitle, setJobTitle] = useState('');
  const [msg, setMsg] = useState<Msg>(null);

  const msgId = (id: StringId) => setMsg({ kind: 'id', id });
  const msgText = (text: string) => setMsg({ kind: 'text', text });

  const load = async () => {
    const { data, error } = await supabase.from('jobs').select('*').order('created_at', { ascending: false }).limit(40);
    if (error) msgText(error.message);
    else setJobs((data ?? []) as Job[]);
  };

  useEffect(() => {
    load().catch(() => msgId('jobs.error.load'));
  }, []);

  const postJob = async () => {
    const uid = session?.user.id;
    if (
      !ensureAuthenticated({
        userId: uid,
        message: 'Sign in to post a job.',
        setMessage: () => msgId('jobs.gate.postSignIn'),
        goToAuth: () => navigation.navigate('Auth'),
      })
    ) {
      return;
    }
    if (
      !ensureRole({
        role,
        requiredRole: 'customer',
        roleMessage: 'Switch to customer role to post jobs.',
        setMessage: () => msgId('jobs.gate.postRole'),
      })
    ) {
      return;
    }
    if (!jobTitle.trim()) return;
    const { error } = await supabase.from('jobs').insert({
      customer_id: uid!,
      title: jobTitle.trim(),
      description: 'Customer posted from Jobs tab',
      category: 'general',
      status: 'open',
      origin: 'customer_job',
      worker_id: null,
    });
    if (error) {
      msgText(error.message);
    } else {
      msgId('jobs.post.toast');
      await trackEvent('job_posted', uid!, { origin: 'customer_job' });
      setJobTitle('');
      await load();
    }
  };

  const openJob = (jobId: string) => {
    if (
      !ensureAuthenticated({
        userId: session?.user.id,
        message: 'Sign in to open job details.',
        setMessage: () => msgId('jobs.gate.openSignIn'),
        goToAuth: () => navigation.navigate('Auth'),
      })
    ) {
      return;
    }
    navigation.navigate('JobDetail', { jobId });
  };

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <ScreenHeader titleId="jobs.title" subtitleId="jobs.subtitle" />

      {!session?.user.id && (
        <Card padding="lg">
          <EmptyState
            icon="log-in"
            titleId="jobs.signInRequired"
            subtitleId="jobs.signInPrompt"
            ctaLabelId="common.signInOrCreate"
            onCta={() => navigation.navigate('Auth')}
          />
        </Card>
      )}

      {role === 'customer' && (
        <Card padding="lg">
          <BiText id="jobs.post.title" variant="title" tone="strong" style={styles.cardTitle} />
          <Input
            value={jobTitle}
            onChangeText={setJobTitle}
            placeholderId="jobs.post.placeholder"
            iconLeft="edit-3"
          />
          <Button labelId="jobs.post.cta" onPress={postJob} iconLeft="plus" fullWidth />
        </Card>
      )}

      {msg ? (msg.kind === 'id' ? <Banner id={msg.id} tone="info" /> : <Banner text={msg.text} tone="warning" />) : null}

      <Card padding="lg">
        <BiText id="jobs.list.title" variant="title" tone="strong" style={styles.cardTitle} />
        {jobs.length === 0 ? (
          <View style={styles.empty}>
            <BiText id="jobs.list.empty" variant="body" tone="muted" align="center" />
          </View>
        ) : (
          jobs.map((j) => (
            <Pressable key={j.id} style={styles.jobRow} onPress={() => openJob(j.id)}>
              <View style={styles.jobIcon}>
                <Icon name="briefcase" size={16} color={colors.primaryDeep} />
              </View>
              <View style={styles.jobBody}>
                <Text style={styles.jobTitle} numberOfLines={2}>{j.title}</Text>
                <View style={styles.jobMetaRow}>
                  <Chip label={j.status.replace('_', ' ')} tone={STATUS_TONE[j.status] ?? 'neutral'} />
                  <Text style={styles.jobMeta}>{j.origin}</Text>
                </View>
              </View>
              <Icon name="chevron-right" size={20} color={colors.textMuted} />
            </Pressable>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1 },
  cardTitle: { marginBottom: spacing.md },
  empty: { paddingVertical: spacing.lg, alignItems: 'center' },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  jobIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  jobBody: { flex: 1 },
  jobTitle: { ...typography.subtitle, color: colors.textStrong },
  jobMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  jobMeta: { ...typography.caption, color: colors.textMuted },
});
