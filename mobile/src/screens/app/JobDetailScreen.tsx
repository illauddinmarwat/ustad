import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Icon } from '../../components/ui/Icon';
import { useLiveDatabase } from '../../config/env';
import { useAuth } from '../../context/AuthContext';
import type { StringId } from '../../i18n/strings';
import { useT } from '../../i18n/useT';
import { trackEvent } from '../../lib/analytics';
import { FinalPriceSection } from '../../components/FinalPriceSection';
import { JobContactSection } from '../../components/JobContactSection';
import { JobStatusTimeline } from '../../components/JobStatusTimeline';
import { JobPaymentSection } from '../../components/JobPaymentSection';
import { ensureAuthenticated } from '../../lib/authGuards';
import { fetchPhase4Flags } from '../../lib/phase4Flags';
import { clampSatisfaction, satisfactionLabel } from '../../lib/quality';
import { computeTimerSeconds, etaBucketLabel, formatDuration, type JobRealtimeState } from '../../lib/realtime';
import { supabase } from '../../lib/supabase';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { nextStep, type NextAction } from '../../lib/jobNextStep';
import { ensureForegroundLocation } from '../../lib/locationPermission';
import { JobMessagesSheet } from '../../components/JobMessagesSheet';
import { FoldCard } from '../../components/ui/FoldCard';
import { KeyboardAvoid } from '../../components/ui/KeyboardAvoid';

type Job = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  origin: string;
  customer_id: string;
  worker_id: string | null;
  category: string;
  location_text: string | null;
  worker_done_at?: string | null;
  completion_note?: string | null;
};

type MessageRow = { id: string; body: string; sender_id: string; created_at: string };
type ReviewRow = { id: string; rating: number; comment: string | null };
type QualitySurveyRow = { id: string; satisfaction: number; would_rehire: boolean; comment: string | null };

type Props = NativeStackScreenProps<RootStackParamList, 'JobDetail'>;

type BannerTone = 'info' | 'success' | 'warning' | 'danger';
type BannerState = { kind: 'id'; id: StringId; tone: BannerTone } | { kind: 'text'; text: string; tone: BannerTone } | null;

const STATUS_STRINGS: Record<string, true> = {
  'job.status.open': true,
  'job.status.quoted': true,
  'job.status.pending_customer_confirm': true,
  'job.status.assigned': true,
  'job.status.completed': true,
  'job.status.payment_pending': true,
  'job.status.disputed': true,
  'job.status.closed': true,
  'job.status.cancelled': true,
};

const STATUS_TONE: Record<string, 'primary' | 'accent' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  open: 'info',
  assigned: 'primary',
  in_progress: 'warning',
  completed: 'accent',
  cancelled: 'danger',
  pending_customer_confirm: 'warning',
  payment_pending: 'warning',
  disputed: 'danger',
  closed: 'accent',
};

export default function JobDetailScreen({ route, navigation }: Props) {
  const { jobId } = route.params;
  const { role, session, language } = useAuth();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [job, setJob] = useState<Job | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [existingReview, setExistingReview] = useState<ReviewRow | null>(null);
  const [msgBody, setMsgBody] = useState('');
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [acceptedAmount, setAcceptedAmount] = useState<number | null>(null);
  const [agreedFinal, setAgreedFinal] = useState<number | null>(null);
  const [banner, setBanner] = useState<BannerState>(null);
  const [phase4RealtimeEnabled, setPhase4RealtimeEnabled] = useState(false);
  const [phase4QualityEnabled, setPhase4QualityEnabled] = useState(false);
  const [realtimeState, setRealtimeState] = useState<JobRealtimeState | null>(null);
  const [nowTs, setNowTs] = useState(Date.now());
  const [rtBusy, setRtBusy] = useState(false);
  const [barBusy, setBarBusy] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(0);
  const [barH, setBarH] = useState(0);
  const [rtMsg, setRtMsg] = useState<{ id?: StringId; text?: string; tone: 'success' | 'danger' } | null>(null);
  const [photoPath, setPhotoPath] = useState('');
  const [photoNote, setPhotoNote] = useState('');
  const [surveyScore, setSurveyScore] = useState(5);
  const [surveyRehire, setSurveyRehire] = useState(true);
  const [surveyComment, setSurveyComment] = useState('');
  const [existingSurvey, setExistingSurvey] = useState<QualitySurveyRow | null>(null);
  const [claimCategory, setClaimCategory] = useState<'quality_issue' | 'damage' | 'no_show' | 'other'>('quality_issue');
  const [claimDescription, setClaimDescription] = useState('');

  const uid = session?.user.id;

  const bannerId = (id: StringId, tone: BannerTone = 'info') => setBanner({ kind: 'id', id, tone });
  const bannerText = (text: string, tone: BannerTone = 'warning') => setBanner({ kind: 'text', text, tone });

  const refreshWorkerSignalsIfNeeded = async () => {
    if (role !== 'worker') return;
    try {
      await supabase.rpc('refresh_my_worker_signals');
    } catch {
      // Non-blocking; ranking backfill still runs nightly via cron.
    }
  };

  const load = useCallback(async () => {
    if (!useLiveDatabase || !uid) return;
    const { data: j, error: je } = await supabase.from('jobs').select('*').eq('id', jobId).maybeSingle();
    if (je || !j) {
      setJob(null);
      if (je) bannerText(je.message, 'danger');
      else bannerId('jobDetail.notFound', 'warning');
      return;
    }
    setJob(j as Job);
    setBanner(null);

    const [m, r] = await Promise.all([
      supabase.from('messages').select('id,body,sender_id,created_at').eq('job_id', jobId).order('created_at', { ascending: true }),
      supabase.from('reviews').select('id,rating,comment').eq('job_id', jobId).maybeSingle(),
    ]);
    setMessages((m.data ?? []) as MessageRow[]);
    setExistingReview((r.data as ReviewRow | null) ?? null);
    const { data: aq } = await supabase
      .from('quotes')
      .select('amount_pkr')
      .eq('job_id', jobId)
      .eq('status', 'accepted')
      .maybeSingle();
    setAcceptedAmount(aq ? Number((aq as { amount_pkr: number }).amount_pkr) : null);

    const flags = await fetchPhase4Flags();
    setPhase4RealtimeEnabled(flags.realtimeEnabled);
    setPhase4QualityEnabled(flags.qualityEnabled);
    if (flags.realtimeEnabled) {
      const rt = await supabase
        .from('job_realtime_states')
        .select('is_en_route,eta_bucket,timer_started_at,timer_accum_seconds,started_work_at,lat,lng')
        .eq('job_id', jobId)
        .maybeSingle();
      setRealtimeState((rt.data as JobRealtimeState | null) ?? null);
    } else {
      setRealtimeState(null);
    }
    if (flags.qualityEnabled && role === 'customer') {
      const survey = await supabase
        .from('job_quality_surveys')
        .select('id,satisfaction,would_rehire,comment')
        .eq('job_id', jobId)
        .maybeSingle();
      setExistingSurvey((survey.data as QualitySurveyRow | null) ?? null);
    } else {
      setExistingSurvey(null);
    }
  }, [jobId, uid, role]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => bannerId('jobDetail.error.load', 'danger'));
    }, [load])
  );

  // Messages arrive while the page is open: refresh them quietly so the floating button can show a count.
  useEffect(() => {
    if (!useLiveDatabase || !uid) return;
    const timer = setInterval(async () => {
      const { data } = await supabase
        .from('messages')
        .select('id,body,sender_id,created_at')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });
      if (data) setMessages(data as MessageRow[]);
    }, 10000);
    return () => clearInterval(timer);
  }, [jobId, uid]);

  // A success note under the pinned button fades after a few seconds; errors stay until the next try.
  useEffect(() => {
    if (rtMsg?.tone !== 'success') return;
    const timer = setTimeout(() => setRtMsg(null), 5000);
    return () => clearTimeout(timer);
  }, [rtMsg]);

  useEffect(() => {
    navigation.setOptions({ title: job?.title ?? t('nav.job').en });
  }, [navigation, job?.title, t]);

  useEffect(() => {
    if (!phase4RealtimeEnabled || !realtimeState?.timer_started_at) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase4RealtimeEnabled, realtimeState?.timer_started_at]);

  // Being the job's Ustad does not depend on which screen they are looking at.
  const isWorkerOwner = !!uid && job?.worker_id === uid;
  const watchSubRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    const shouldTrack = phase4RealtimeEnabled && isWorkerOwner && realtimeState?.is_en_route;
    if (!shouldTrack) {
      watchSubRef.current?.remove();
      watchSubRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (!(await ensureForegroundLocation()) || cancelled) return;
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 30 },
          (position) => {
            void supabase.rpc('worker_update_job_location', {
              p_job_id: jobId,
              p_lat: position.coords.latitude,
              p_lng: position.coords.longitude,
            });
          }
        );
        // Stopped while the subscription was starting: drop it now, the cleanup already ran.
        if (cancelled) sub.remove();
        else watchSubRef.current = sub;
      } catch {
        // Location services off or permission revoked: sharing just does not start.
      }
    })();
    return () => {
      cancelled = true;
      watchSubRef.current?.remove();
      watchSubRef.current = null;
    };
  }, [phase4RealtimeEnabled, isWorkerOwner, realtimeState?.is_en_route, jobId]);

  const sendMessage = async () => {
    if (
      !ensureAuthenticated({
        userId: uid,
        message: 'Sign in to send messages.',
        setMessage: () => bannerId('jobDetail.messages.signInToSend', 'warning'),
        goToAuth: () => navigation.navigate('Auth'),
      })
    ) {
      return;
    }
    if (!msgBody.trim()) return;
    const { error } = await supabase.from('messages').insert({
      job_id: jobId,
      sender_id: uid,
      body: msgBody.trim(),
    });
    if (error) {
      bannerText(error.message, 'danger');
    } else {
      setBanner(null);
      setMsgBody('');
      await load();
    }
  };

  const confirmBooking = async () => {
    const { error } = await supabase.rpc('customer_confirm_booking', { job_id: jobId });
    if (error) bannerText(error.message, 'danger');
    else {
      bannerId('jobDetail.confirm.toast', 'success');
      await trackEvent('booking_confirmed', uid ?? null, { job_id: jobId });
      await load();
    }
  };

  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState('');

  // The Ustad says the work is done; the customer then confirms (or says it is not finished).
  const workDone = async () => {
    const { error } = await supabase.rpc('worker_mark_work_done', { p_job_id: jobId });
    if (error) bannerText(error.message, 'danger');
    else {
      bannerId('jobDetail.workDone.toast', 'success');
      await trackEvent('work_marked_done', uid ?? null, { job_id: jobId });
      await load();
    }
  };

  const notFinished = async () => {
    const { error } = await supabase.rpc('customer_reject_completion', { p_job_id: jobId, p_note: rejectNote.trim() || null });
    if (error) bannerText(error.message, 'danger');
    else {
      bannerId('jobDetail.confirmDone.sent', 'info');
      setRejecting(false);
      setRejectNote('');
      await load();
    }
  };

  const markComplete = async () => {
    const { error } = await supabase.rpc('mark_job_completed', { job_id: jobId });
    if (error) bannerText(error.message, 'danger');
    else {
      bannerId('jobDetail.complete.toast', 'success');
      await trackEvent('job_completed', uid ?? null, { job_id: jobId });
      await refreshWorkerSignalsIfNeeded();
      await load();
    }
  };

  // The on-the-way and timer buttons: one request at a time, with the result shown right under the buttons
  // (the page banner is off-screen by the time someone is down here).
  const setRealtime = async (
    args: { enRoute?: boolean; etaMinutes?: number; timerRunning?: boolean },
    done: StringId
  ) => {
    if (rtBusy) return;
    setRtBusy(true);
    setRtMsg(null);
    try {
      const { error } = await supabase.rpc('worker_set_job_realtime_state', {
        p_job_id: jobId,
        p_is_en_route: args.enRoute ?? null,
        p_eta_minutes: args.etaMinutes ?? null,
        p_timer_running: args.timerRunning ?? null,
      });
      if (error) {
        setRtMsg({ text: error.message, tone: 'danger' });
        return;
      }
      setRtMsg({ id: done, tone: 'success' });
      if (typeof args.enRoute === 'boolean') {
        await trackEvent(args.enRoute ? 'phase4_worker_en_route_started' : 'phase4_worker_en_route_stopped', uid ?? null, {
          job_id: jobId,
          eta_minutes: args.etaMinutes ?? null,
        });
      }
      if (typeof args.timerRunning === 'boolean') {
        await trackEvent(args.timerRunning ? 'phase4_job_timer_started' : 'phase4_job_timer_stopped', uid ?? null, {
          job_id: jobId,
        });
      }
      await load();
    } catch (e) {
      setRtMsg({ text: e instanceof Error ? e.message : String(e), tone: 'danger' });
    } finally {
      setRtBusy(false);
    }
  };

  // The pinned button at the bottom: whichever step is next for this person, one request at a time.
  const runStep = async (action: NextAction) => {
    if (barBusy || rtBusy) return;
    setBarBusy(true);
    try {
      if (action === 'confirmBooking') await confirmBooking();
      else if (action === 'markComplete') await markComplete();
      else if (action === 'workDone') {
        // Finishing the work also ends a timer that is still running, so the time stops where the work did.
        if (realtimeState?.timer_started_at) {
          await supabase.rpc('worker_set_job_realtime_state', {
            p_job_id: jobId,
            p_is_en_route: null,
            p_eta_minutes: null,
            p_timer_running: false,
          });
        }
        await workDone();
      }
      else if (action === 'startEnRoute') await setRealtime({ enRoute: true, etaMinutes: 30 }, 'jobDetail.live.toast.enRoute');
      else await setRealtime({ enRoute: false }, 'jobDetail.live.toast.arrived');
    } finally {
      setBarBusy(false);
    }
  };

  const submitReview = async () => {
    if (!uid || !job?.worker_id) return;
    const { error } = await supabase.from('reviews').insert({
      job_id: jobId,
      reviewer_id: uid,
      reviewee_id: job.worker_id,
      rating,
      comment: reviewComment.trim() || null,
    });
    if (error) bannerText(error.message, 'danger');
    else {
      bannerId('jobDetail.review.toast', 'success');
      await load();
    }
  };

  const submitCompletionPhoto = async () => {
    if (!uid || !photoPath.trim()) {
      bannerText('Enter a photo path (storage placeholder)', 'warning');
      return;
    }
    const { error } = await supabase.from('job_completion_photos').insert({
      job_id: jobId,
      uploader_id: uid,
      storage_path: photoPath.trim(),
      note: photoNote.trim() || null,
    });
    if (error) {
      bannerText(error.message, 'danger');
    } else {
      bannerText('Post-job photo prompt saved', 'success');
      await trackEvent('phase4_post_job_photo_prompt_submitted', uid, { job_id: jobId });
      setPhotoPath('');
      setPhotoNote('');
    }
  };

  const submitQualitySurvey = async () => {
    if (!uid) return;
    const { error } = await supabase.rpc('submit_job_quality_survey', {
      p_job_id: jobId,
      p_satisfaction: clampSatisfaction(surveyScore),
      p_would_rehire: surveyRehire,
      p_comment: surveyComment.trim() || null,
    });
    if (error) bannerText(error.message, 'danger');
    else {
      bannerText('Micro-survey submitted', 'success');
      await trackEvent('phase4_job_micro_survey_submitted', uid, {
        job_id: jobId,
        satisfaction: clampSatisfaction(surveyScore),
        would_rehire: surveyRehire,
      });
      await load();
    }
  };

  const submitClaimIntake = async () => {
    if (!uid || !claimDescription.trim()) {
      bannerText('Describe your claim', 'warning');
      return;
    }
    const { error } = await supabase.rpc('submit_guarantee_claim_intake', {
      p_job_id: jobId,
      p_category: claimCategory,
      p_description: claimDescription.trim(),
      p_evidence: {},
    });
    if (error) bannerText(error.message, 'danger');
    else {
      bannerText('Claim intake submitted', 'success');
      await trackEvent('phase4_guarantee_claim_intake_submitted', uid, {
        job_id: jobId,
        category: claimCategory,
      });
      setClaimDescription('');
    }
  };

  const reportUser = async () => {
    if (!job) return;
    const target = job.customer_id === uid ? job.worker_id : job.customer_id;
    if (!uid || !target) return;
    const { error } = await supabase.from('abuse_reports').insert({
      reporter_id: uid,
      reported_user_id: target,
      job_id: jobId,
      reason: 'Inappropriate behavior report from job thread',
    });
    if (error) bannerText(error.message, 'danger');
    else bannerId('jobDetail.messages.reportToast', 'success');
  };

  if (!useLiveDatabase) {
    return (
      <View style={styles.offline}>
        <EmptyState icon="wifi-off" titleId="jobDetail.offline" />
      </View>
    );
  }

  if (!uid) {
    return (
      <View style={styles.offline}>
        <EmptyState
          icon="log-in"
          titleId="jobDetail.signInPrompt"
          ctaLabelId="common.signInOrCreate"
          onCta={() => navigation.navigate('Auth')}
        />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.offline}>
        <SkeletonList count={3} />
      </View>
    );
  }

  const isCustomer = job.customer_id === uid;
  const isWorker = job.worker_id === uid;
  const showConfirm = isCustomer && job.status === 'pending_customer_confirm' && job.origin === 'service_listing';
  const showComplete = (isCustomer || isWorker) && job.status === 'assigned';
  const workerSaidDone = !!job.worker_done_at;
  const afterWork = ['completed', 'payment_pending', 'disputed', 'closed'].includes(job.status);
  const showReview = isCustomer && afterWork && job.worker_id && !existingReview;
  const showQuality = phase4QualityEnabled && afterWork && (isCustomer || isWorker);
  const realtimeVisible = phase4RealtimeEnabled && (isCustomer || isWorker) && !!job.worker_id;
  const timerSeconds = computeTimerSeconds(realtimeState, nowTs);
  const timerText = formatDuration(timerSeconds);
  // Messages from the other person since the one opened the conversation (or since they last wrote).
  const lastMineIdx = messages.reduce((acc, m, idx) => (m.sender_id === uid ? idx : acc), -1);
  const unread = msgOpen
    ? 0
    : messages.slice(Math.max(lastMineIdx + 1, seenAt)).filter((m) => m.sender_id !== uid).length;
  const step =
    isCustomer || isWorker
      ? nextStep({
          viewer: isCustomer ? 'customer' : 'worker',
          status: job.status,
          origin: job.origin,
          workerDone: workerSaidDone,
          realtime: phase4RealtimeEnabled,
          enRoute: !!realtimeState?.is_en_route,
          startedWork: !!realtimeState?.started_work_at,
          tracked: !!realtimeState,
        })
      : null;

  return (
    <KeyboardAvoid>
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.md }]}
      keyboardShouldPersistTaps="handled"
    >
      <Card padding="lg">
        <Text style={styles.title}>{job.title}</Text>
        <View style={styles.tagsRow}>
          <Chip label={job.category} tone="neutral" icon="tag" />
          <Chip
            label={
              `job.status.${job.status}` in STATUS_STRINGS
                ? t(`job.status.${job.status}` as StringId)[language === 'ur' ? 'ur' : 'en']
                : job.status.replace('_', ' ')
            }
            tone={STATUS_TONE[job.status] ?? 'neutral'}
          />
        </View>
        {job.location_text ? (
          <View style={styles.metaRow}>
            <Icon name="map-pin" size={14} color={colors.textMuted} />
            <BiText id="jobDetail.area" hideUrdu variant="caption" tone="muted" style={styles.metaLabel} />
            <Text style={styles.metaValue}>{job.location_text}</Text>
          </View>
        ) : null}
        {job.description ? <Text style={styles.body}>{job.description}</Text> : null}
      </Card>

      {isCustomer || isWorker ? (
        <JobStatusTimeline
          viewer={isCustomer ? 'customer' : 'worker'}
          status={job.status}
          origin={job.origin}
          workerDone={workerSaidDone}
          hasQuote={acceptedAmount != null}
          enRoute={!!realtimeState?.is_en_route || !!realtimeState?.started_work_at}
          showEnRoute={phase4RealtimeEnabled}
        />
      ) : null}

      {banner ? (
        banner.kind === 'id' ? (
          <Banner id={banner.id} tone={banner.tone} />
        ) : (
          <Banner text={banner.text} tone={banner.tone} />
        )
      ) : null}

      {showConfirm && (
        <Card padding="lg">
          <BiText id="jobDetail.confirm.title" variant="title" tone="strong" style={styles.cardTitle} />
          <BiText id="jobDetail.confirm.subtitle" variant="body" tone="muted" />
        </Card>
      )}

      {showComplete && isCustomer && workerSaidDone && (
        <Card padding="lg">
          <BiText id="jobDetail.confirmDone.title" variant="title" tone="strong" style={styles.cardTitle} />
          <BiText id="jobDetail.confirmDone.subtitle" variant="body" tone="muted" style={styles.cardSubtitle} />
          {rejecting ? (
            <View style={styles.rejectBox}>
              <TextInput
                value={rejectNote}
                onChangeText={setRejectNote}
                placeholder={t('jobDetail.confirmDone.notePh').en}
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                multiline
                maxLength={300}
                accessibilityLabel={t('jobDetail.confirmDone.notePh').en}
              />
              <Button labelId="jobDetail.confirmDone.send" onPress={notFinished} variant="secondary" fullWidth />
            </View>
          ) : (
            <Button labelId="jobDetail.confirmDone.no" onPress={() => setRejecting(true)} variant="ghost" fullWidth />
          )}
        </Card>
      )}

      {showComplete && isCustomer && !workerSaidDone && (
        <Card padding="lg">
          <BiText id="jobDetail.complete.hint" variant="bodySm" tone="muted" />
        </Card>
      )}

      {showComplete && isWorker && workerSaidDone && <Banner id="jobDetail.workDone.waiting" tone="info" icon="clock" />}
      {showComplete && isWorker && !workerSaidDone && job.completion_note ? (
        <Banner text={`${t('jobDetail.workDone.rejected').en} ${job.completion_note}`} tone="warning" />
      ) : null}

      {realtimeVisible && (
        <Card padding="md">
          <BiText id="jobDetail.live.title" variant="label" tone="strong" style={styles.cardTitle} />
          <View style={styles.statusRow}>
            <Icon name="navigation" size={14} color={colors.primary} />
            <BiText id="jobDetail.timeline.workerStatus" hideUrdu variant="caption" tone="muted" style={styles.statusLabel} />
            <Text style={styles.statusValue}>
              {realtimeState?.is_en_route ? etaBucketLabel(realtimeState.eta_bucket) : t('jobDetail.timeline.notEnRoute').en}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Icon name="clock" size={14} color={colors.primary} />
            <BiText id="jobDetail.timeline.jobTimer" hideUrdu variant="caption" tone="muted" style={styles.statusLabel} />
            <Text style={styles.statusValue}>{timerText}</Text>
          </View>
          {isWorker && job.status === 'assigned' && (
            <View style={styles.realtimeCtas}>
              {realtimeState?.timer_started_at ? (
                <Button
                  labelId="jobDetail.timeline.pauseTimer"
                  onPress={() => setRealtime({ timerRunning: false }, 'jobDetail.live.toast.timerOff')}
                  variant="secondary"
                  iconLeft="pause"
                  size="sm"
                  disabled={rtBusy}
                />
              ) : (
                <Button
                  labelId={timerSeconds > 0 ? 'jobDetail.timeline.resumeTimer' : 'jobDetail.timeline.startTimer'}
                  onPress={() => setRealtime({ timerRunning: true }, 'jobDetail.live.toast.timerOn')}
                  variant="secondary"
                  iconLeft="play"
                  size="sm"
                  disabled={rtBusy}
                />
              )}
            </View>
          )}
          {realtimeState?.is_en_route && (isCustomer || isWorker) && (
            <Button
              labelId="tracking.cta"
              onPress={() => navigation.navigate('JobTracking', { jobId })}
              iconLeft="map"
              variant="success"
              size="sm"
              fullWidth
              style={styles.trackBtn}
            />
          )}
        </Card>
      )}

      <JobContactSection
        jobId={jobId}
        status={job.status}
        isCustomer={isCustomer}
        isWorker={isWorker}
        defaultOpen={job.status === 'assigned'}
      />

      <FinalPriceSection
        jobId={jobId}
        status={job.status}
        isCustomer={isCustomer}
        isWorker={isWorker}
        onChanged={load}
        onAgreed={setAgreedFinal}
      />

      <JobPaymentSection
        jobId={jobId}
        status={job.status}
        isCustomer={isCustomer}
        isWorker={isWorker}
        suggestedAmount={agreedFinal ?? acceptedAmount}
        defaultOpen={afterWork}
        onChanged={load}
      />

      {existingReview && isCustomer && (
        <Card padding="lg">
          <BiText id="jobDetail.review.title" variant="title" tone="strong" style={styles.cardTitle} />
          <View style={styles.reviewRow}>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Icon key={n} name="star" set={n <= existingReview.rating ? 'ion' : 'feather'} size={18} color={colors.warning} />
              ))}
            </View>
            <Text style={styles.body}>{existingReview.comment ?? t('jobDetail.review.noComment').en}</Text>
          </View>
        </Card>
      )}

      {showReview && (
        <FoldCard titleId="jobDetail.review.rate" defaultOpen={true}>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                onPress={() => setRating(n)}
                accessibilityRole="button"
                style={[styles.starBtn, rating >= n && styles.starBtnOn]}
              >
                <Icon name="star" set="ion" size={20} color={rating >= n ? colors.warning : colors.textMuted} />
              </Pressable>
            ))}
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('jobDetail.review.comment').en}</Text>
            <TextInput
              value={reviewComment}
              onChangeText={setReviewComment}
              placeholder={t('jobDetail.review.comment').en}
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.inputMulti]}
              multiline
            />
          </View>
          <Button labelId="jobDetail.review.submit" onPress={submitReview} iconRight="send" fullWidth />
        </FoldCard>
      )}

      {showQuality && (
        <FoldCard titleId="account.help.title" defaultOpen={false}>
          <Text style={styles.body}>Post-job photo prompt (stub)</Text>
          <View style={styles.field}>
            <TextInput
              value={photoPath}
              onChangeText={setPhotoPath}
              placeholder="storage path (e.g. job-photos/job123-after.jpg)"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <TextInput
              value={photoNote}
              onChangeText={setPhotoNote}
              placeholder="Optional note about completion photo"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
          <Button labelId="common.save" onPress={submitCompletionPhoto} iconLeft="camera" fullWidth />

          {isCustomer && (
            <View style={styles.qualitySection}>
              <Text style={styles.body}>Satisfaction micro-survey</Text>
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={`survey-${n}`}
                    onPress={() => setSurveyScore(n)}
                    style={[styles.starBtn, surveyScore >= n && styles.starBtnOn]}
                  >
                    <Icon name="star" set="ion" size={20} color={surveyScore >= n ? colors.warning : colors.textMuted} />
                  </Pressable>
                ))}
              </View>
              <Text style={styles.meta}>Selected: {satisfactionLabel(surveyScore)}</Text>
              <View style={styles.rowBetween}>
                <Text style={styles.body}>Would hire again?</Text>
                <Pressable onPress={() => setSurveyRehire((v) => !v)}>
                  <Text style={styles.link}>{surveyRehire ? t('common.yes').en : t('common.no').en}</Text>
                </Pressable>
              </View>
              <TextInput
                value={surveyComment}
                onChangeText={setSurveyComment}
                placeholder="Optional feedback"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.inputMulti]}
                multiline
              />
              <Button labelId="common.submit" onPress={submitQualitySurvey} iconRight="send" fullWidth />
              {existingSurvey && (
                <Text style={styles.meta}>
                  Existing survey: {existingSurvey.satisfaction}/5, rehire: {existingSurvey.would_rehire ? 'yes' : 'no'}
                </Text>
              )}
            </View>
          )}

          <View style={styles.qualitySection}>
            <Text style={styles.body}>Guarantee / claims intake (stub)</Text>
            <TextInput
              value={claimCategory}
              onChangeText={(v) => setClaimCategory((v as typeof claimCategory) || 'other')}
              placeholder="quality_issue | damage | no_show | other"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={claimDescription}
              onChangeText={setClaimDescription}
              placeholder="Describe issue for ops follow-up"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.inputMulti]}
              multiline
            />
            <Button labelId="common.submit" onPress={submitClaimIntake} iconRight="send" fullWidth />
          </View>
        </FoldCard>
      )}

    </ScrollView>
    {isCustomer || isWorker ? (
      <Pressable
        onPress={() => {
          setMsgOpen(true);
          setSeenAt(messages.length);
        }}
        accessibilityRole="button"
        accessibilityLabel={t('jobDetail.messages.title').en}
        style={[styles.fab, { bottom: barH + spacing.lg }]}
      >
        <Icon name="message-circle" size={24} color={colors.primaryInk} />
        {unread > 0 ? (
          <View style={styles.fabBadge}>
            <Text style={styles.fabBadgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        ) : null}
      </Pressable>
    ) : null}
    <JobMessagesSheet
      visible={msgOpen}
      onClose={() => setMsgOpen(false)}
      messages={messages}
      uid={uid}
      body={msgBody}
      onBodyChange={setMsgBody}
      onSend={sendMessage}
      onReport={isCustomer || isWorker ? reportUser : undefined}
    />
    {step || rtMsg ? (
      <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.md }]} onLayout={(e) => setBarH(e.nativeEvent.layout.height)}>
        {rtMsg ? (
          rtMsg.id ? <Banner id={rtMsg.id} tone={rtMsg.tone} /> : <Banner text={rtMsg.text ?? ''} tone={rtMsg.tone} />
        ) : null}
        {step ? (
          <Button
            labelId={step.labelId}
            onPress={() => runStep(step.action)}
            variant={step.variant}
            iconLeft={step.icon}
            fullWidth
            size="lg"
            loading={barBusy || rtBusy}
            disabled={barBusy || rtBusy}
          />
        ) : null}
        {step?.also ? (
          <Button
            labelId={step.also.labelId}
            onPress={() => runStep(step.also!.action)}
            variant="secondary"
            iconLeft={step.also.icon}
            fullWidth
            disabled={barBusy || rtBusy}
          />
        ) : null}
      </View>
    ) : null}
    </KeyboardAvoid>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  fabBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  flex: { flex: 1 },
  bar: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  rejectBox: { gap: spacing.sm, marginTop: spacing.sm },
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1, paddingBottom: 48 },
  offline: { flex: 1, padding: spacing.lg, justifyContent: 'center', backgroundColor: colors.bg },
  title: { ...typography.displayMd, color: colors.textStrong, marginBottom: spacing.sm },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: 6 },
  metaLabel: { marginRight: 4 },
  metaValue: { ...typography.bodySm, color: colors.textStrong },
  body: { ...typography.body, color: colors.textBody, marginTop: spacing.sm },
  cardTitle: { marginBottom: spacing.sm },
  cardSubtitle: { marginBottom: spacing.md },
  field: { marginBottom: spacing.sm },
  fieldLabel: { ...typography.label, color: colors.textBody, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
    ...typography.body,
    color: colors.textStrong,
    backgroundColor: colors.surface,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  timeline: { gap: 10, marginBottom: spacing.md },
  timelineItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timelineLabel: { flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: 6 },
  statusLabel: { marginRight: 4 },
  statusValue: { ...typography.bodySm, color: colors.textStrong },
  realtimeCtas: { gap: spacing.sm, marginTop: spacing.md },
  trackBtn: { marginTop: spacing.md },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  link: { ...typography.button, color: colors.primary },
  empty: { paddingVertical: spacing.md, alignItems: 'center' },
  bubbleRow: { marginVertical: 4 },
  bubbleRowMine: { alignItems: 'flex-end' },
  bubbleRowTheirs: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: radius.xs },
  bubbleTheirs: {
    backgroundColor: colors.surfaceAlt,
    borderBottomLeftRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  bubbleLabel: { ...typography.caption, marginBottom: 2 },
  bubbleLabelMine: { color: 'rgba(255,255,255,0.85)' },
  bubbleLabelTheirs: { color: colors.textMuted },
  bubbleText: { ...typography.body, color: colors.textStrong },
  bubbleTextMine: { color: colors.primaryInk },
  composer: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  composerInput: { flex: 1 },
  composerSend: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, gap: 6 },
  reportText: {},
  reviewRow: { gap: spacing.sm },
  starsRow: { flexDirection: 'row', gap: 4 },
  stars: { flexDirection: 'row', gap: 8, marginBottom: spacing.sm },
  starBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starBtnOn: { backgroundColor: colors.warningSoft },
  qualitySection: { marginTop: spacing.lg, gap: spacing.sm },
});
