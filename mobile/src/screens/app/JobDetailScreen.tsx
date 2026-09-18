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
import { Icon } from '../../components/ui/Icon';
import { useLiveDatabase } from '../../config/env';
import { useAuth } from '../../context/AuthContext';
import type { StringId } from '../../i18n/strings';
import { useT } from '../../i18n/useT';
import { trackEvent } from '../../lib/analytics';
import { ensureAuthenticated } from '../../lib/authGuards';
import { fetchPhase4Flags } from '../../lib/phase4Flags';
import { clampSatisfaction, satisfactionLabel } from '../../lib/quality';
import { computeTimerSeconds, etaBucketLabel, formatDuration, type JobRealtimeState } from '../../lib/realtime';
import { supabase } from '../../lib/supabase';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

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
};

type MessageRow = { id: string; body: string; sender_id: string; created_at: string };
type ReviewRow = { id: string; rating: number; comment: string | null };
type QualitySurveyRow = { id: string; satisfaction: number; would_rehire: boolean; comment: string | null };

type Props = NativeStackScreenProps<RootStackParamList, 'JobDetail'>;

type BannerTone = 'info' | 'success' | 'warning' | 'danger';
type BannerState = { kind: 'id'; id: StringId; tone: BannerTone } | { kind: 'text'; text: string; tone: BannerTone } | null;

const STATUS_TONE: Record<string, 'primary' | 'accent' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  open: 'info',
  assigned: 'primary',
  in_progress: 'warning',
  completed: 'accent',
  cancelled: 'danger',
  pending_customer_confirm: 'warning',
};

export default function JobDetailScreen({ route, navigation }: Props) {
  const { jobId } = route.params;
  const { role, session } = useAuth();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [job, setJob] = useState<Job | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [existingReview, setExistingReview] = useState<ReviewRow | null>(null);
  const [msgBody, setMsgBody] = useState('');
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('3000');
  const [banner, setBanner] = useState<BannerState>(null);
  const [phase4RealtimeEnabled, setPhase4RealtimeEnabled] = useState(false);
  const [phase4QualityEnabled, setPhase4QualityEnabled] = useState(false);
  const [realtimeState, setRealtimeState] = useState<JobRealtimeState | null>(null);
  const [nowTs, setNowTs] = useState(Date.now());
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

  useEffect(() => {
    navigation.setOptions({ title: job?.title ?? t('nav.job').en });
  }, [navigation, job?.title, t]);

  useEffect(() => {
    if (!phase4RealtimeEnabled || !realtimeState?.timer_started_at) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase4RealtimeEnabled, realtimeState?.timer_started_at]);

  const isWorkerOwner = role === 'worker' && job?.worker_id === uid;
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
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted || cancelled) return;
      watchSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 30 },
        (position) => {
          void supabase.rpc('worker_update_job_location', {
            p_job_id: jobId,
            p_lat: position.coords.latitude,
            p_lng: position.coords.longitude,
          });
        }
      );
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

  const setRealtime = async (args: { enRoute?: boolean; etaMinutes?: number; timerRunning?: boolean }) => {
    const { error } = await supabase.rpc('worker_set_job_realtime_state', {
      p_job_id: jobId,
      p_is_en_route: args.enRoute ?? null,
      p_eta_minutes: args.etaMinutes ?? null,
      p_timer_running: args.timerRunning ?? null,
    });
    if (error) {
      bannerText(error.message, 'danger');
    } else {
      setBanner(null);
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

  const markPaid = async () => {
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      bannerId('jobDetail.payment.invalid', 'warning');
      return;
    }
    const { error } = await supabase.rpc('mark_job_paid', {
      p_job_id: jobId,
      p_amount: amount,
      p_method: 'manual',
      p_note: 'Marked paid from app',
    });
    if (error) bannerText(error.message, 'danger');
    else {
      bannerId('jobDetail.payment.toast', 'success');
      await trackEvent('payment_marked_paid', uid ?? null, { job_id: jobId, amount_pkr: amount });
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
        <BiText id="common.loading" variant="body" tone="muted" align="center" />
      </View>
    );
  }

  const isCustomer = role === 'customer' && job.customer_id === uid;
  const isWorker = role === 'worker' && job.worker_id === uid;
  const showConfirm = isCustomer && job.status === 'pending_customer_confirm' && job.origin === 'service_listing';
  const showComplete = (isCustomer || isWorker) && job.status === 'assigned';
  const showReview = isCustomer && job.status === 'completed' && job.worker_id && !existingReview;
  const showQuality = phase4QualityEnabled && job.status === 'completed' && (isCustomer || isWorker);
  const realtimeVisible = phase4RealtimeEnabled && (isCustomer || isWorker) && !!job.worker_id;
  const timerSeconds = computeTimerSeconds(realtimeState, nowTs);
  const timerText = formatDuration(timerSeconds);
  const timeline = [
    { labelId: 'jobDetail.timeline.assigned' as StringId, done: ['assigned', 'completed'].includes(job.status) },
    { labelId: 'jobDetail.timeline.enRoute' as StringId, done: !!realtimeState?.is_en_route || !!realtimeState?.started_work_at || job.status === 'completed' },
    { labelId: 'jobDetail.timeline.inProgress' as StringId, done: !!realtimeState?.started_work_at || job.status === 'completed' },
    { labelId: 'jobDetail.timeline.complete' as StringId, done: job.status === 'completed' },
  ];

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.md }]} keyboardShouldPersistTaps="handled">
      <Card padding="lg">
        <Text style={styles.title}>{job.title}</Text>
        <View style={styles.tagsRow}>
          <Chip label={job.category} tone="neutral" icon="tag" />
          <Chip label={job.status.replace('_', ' ')} tone={STATUS_TONE[job.status] ?? 'neutral'} />
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
          <BiText id="jobDetail.confirm.subtitle" variant="body" tone="muted" style={styles.cardSubtitle} />
          <Button labelId="jobDetail.confirm.cta" onPress={confirmBooking} iconLeft="check" fullWidth />
        </Card>
      )}

      {showComplete && (
        <Card padding="lg">
          <Button labelId="jobDetail.complete.cta" onPress={markComplete} variant="success" iconLeft="check-circle" fullWidth size="lg" />
        </Card>
      )}

      {realtimeVisible && (
        <Card padding="lg">
          <BiText id="jobDetail.timeline.title" variant="title" tone="strong" style={styles.cardTitle} />
          <BiText id="jobDetail.timeline.subtitle" variant="bodySm" tone="muted" style={styles.cardSubtitle} />
          <View style={styles.timeline}>
            {timeline.map((step) => (
              <View key={step.labelId} style={styles.timelineItem}>
                <Icon
                  name={step.done ? 'check-circle' : 'circle'}
                  size={18}
                  color={step.done ? colors.accent : colors.textMuted}
                />
                <BiText
                  id={step.labelId}
                  variant="label"
                  tone={step.done ? 'strong' : 'muted'}
                  style={styles.timelineLabel}
                />
              </View>
            ))}
          </View>
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
              <Button labelId="jobDetail.timeline.startEnRoute" onPress={() => setRealtime({ enRoute: true, etaMinutes: 30 })} iconLeft="navigation" />
              <Button labelId="jobDetail.timeline.arrived" onPress={() => setRealtime({ enRoute: false })} variant="secondary" iconLeft="map-pin" />
              <Button labelId="jobDetail.timeline.startTimer" onPress={() => setRealtime({ timerRunning: true })} variant="secondary" iconLeft="play" />
              <Button labelId="jobDetail.timeline.pauseTimer" onPress={() => setRealtime({ timerRunning: false })} variant="secondary" iconLeft="pause" />
            </View>
          )}
          {realtimeState?.is_en_route && (isCustomer || isWorker) && (
            <Button
              labelId="tracking.cta"
              onPress={() => navigation.navigate('JobTracking', { jobId })}
              iconLeft="map"
              variant="success"
              fullWidth
              style={styles.trackBtn}
            />
          )}
        </Card>
      )}

      {(isCustomer || isWorker) && (
        <Card padding="lg">
          <BiText id="jobDetail.payment.title" variant="title" tone="strong" style={styles.cardTitle} />
          <BiText id="jobDetail.payment.subtitle" variant="bodySm" tone="muted" style={styles.cardSubtitle} />
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('jobDetail.payment.amount').en}</Text>
            <TextInput
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              keyboardType="numeric"
              placeholder={t('jobDetail.payment.amount').en}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
          <Button labelId="jobDetail.payment.cta" onPress={markPaid} variant="success" iconLeft="dollar-sign" fullWidth />
        </Card>
      )}

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
        <Card padding="lg">
          <BiText id="jobDetail.review.rate" variant="title" tone="strong" style={styles.cardTitle} />
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
        </Card>
      )}

      {showQuality && (
        <Card padding="lg">
          <BiText id="account.help.title" variant="title" tone="strong" style={styles.cardTitle} />
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
        </Card>
      )}

      <Card padding="lg">
        <BiText id="jobDetail.messages.title" variant="title" tone="strong" style={styles.cardTitle} />
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <BiText id="jobDetail.messages.empty" variant="body" tone="muted" align="center" />
          </View>
        ) : (
          messages.map((m) => {
            const isMine = m.sender_id === uid;
            return (
              <View key={m.id} style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleLabel, isMine ? styles.bubbleLabelMine : styles.bubbleLabelTheirs]}>
                    {isMine ? t('jobDetail.messages.you').en : t('jobDetail.messages.participant').en}
                  </Text>
                  <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{m.body}</Text>
                </View>
              </View>
            );
          })
        )}
        <View style={styles.composer}>
          <TextInput
            value={msgBody}
            onChangeText={setMsgBody}
            placeholder={t('jobDetail.messages.placeholder').en}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.composerInput]}
          />
          <Pressable
            onPress={sendMessage}
            accessibilityRole="button"
            accessibilityLabel={t('jobDetail.messages.send').en}
            style={styles.composerSend}
          >
            <Icon name="send" size={18} color={colors.primaryInk} />
          </Pressable>
        </View>
        {(isCustomer || isWorker) && (
          <Pressable onPress={reportUser} style={styles.reportRow}>
            <Icon name="flag" size={14} color={colors.danger} />
            <BiText id="jobDetail.messages.report" hideUrdu variant="caption" tone="muted" enStyle={{ color: colors.danger }} style={styles.reportText} />
          </Pressable>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
