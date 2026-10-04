import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AiHelpButton } from '../../components/ai/AiHelpButton';
import { BilingualReview, type ReviewField } from '../../components/ai/BilingualReview';
import { useCityAreaFields } from '../../components/CityAreaFields';
import { PhotoAttach } from '../../components/PhotoAttach';
import { PlaceSection } from '../../components/PlaceSection';
import { TimeChips } from '../../components/TimeChips';
import { VideoRecorder } from '../../components/VideoRecorder';
import { VoiceRecorder } from '../../components/VoiceRecorder';
import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { Input } from '../../components/ui/Input';
import { WizardShell } from '../../components/wizard/WizardShell';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n/useT';
import { AI_ERROR_STRING, fetchAiHelpEnabled } from '../../lib/aiDraft';
import { trackEvent } from '../../lib/analytics';
import { fetchJobMediaEnabled, uploadJobPhotos, uploadJobVideoClip, uploadJobVoice } from '../../lib/jobMedia';
import {
  addGuestJob,
  fetchJobPostingEnabled,
  validatePostJob,
  type PostJobErrors,
} from '../../lib/jobPosting';
import { useProfileCity } from '../../lib/useProfileCity';
import { useSkillCategories } from '../../lib/skillCategories';
import { supabase } from '../../lib/supabase';
import { useBilingual } from '../../lib/useBilingual';
import type { VideoClip } from '../../lib/videoNote';
import type { VoiceNote } from '../../lib/voiceNote';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PostJob'>;

const POST_FIELDS = ['title', 'description'];
const REVIEW_FIELDS: ReviewField[] = [
  { key: 'title', labelId: 'post.field.title' },
  { key: 'description', labelId: 'post.field.description', multiline: true },
];

export default function PostJobScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'PostJob'>>();
  const { session, role } = useAuth();
  const { t } = useT();
  const categories = useSkillCategories();

  const [step, setStep] = useState(1);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const profileCity = useProfileCity(session?.user.id);
  const place = useCityAreaFields({ cityName: profileCity, areaName: null, addressDetails: null, location: null });
  const city = place.cityName;
  // Area plus the street / landmark line, as one short place text.
  const area = [place.areaName, place.addressDetails].filter(Boolean).join(', ').slice(0, 140);
  const [photos, setPhotos] = useState<string[]>([]);
  const [voice, setVoice] = useState<VoiceNote | null>(null);
  const [video, setVideo] = useState<VideoClip | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [mediaEnabled, setMediaEnabled] = useState(false);
  const [preferredTime, setPreferredTime] = useState('');
  const [errors, setErrors] = useState<PostJobErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fillError, setFillError] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const bi = useBilingual('job', POST_FIELDS);
  const draft = route.params?.draft;
  const prefill = route.params?.prefill;

  useEffect(() => {
    fetchJobPostingEnabled().then(setEnabled);
    fetchJobMediaEnabled().then(setMediaEnabled);
    fetchAiHelpEnabled().then(setAiEnabled);
  }, []);

  // A draft from "Help me write": one text in the author's language. They read and edit it here; the other
  // language is made once, on the review step.
  useEffect(() => {
    if (!draft) return;
    bi.reset();
    setTitle(draft.title);
    setDescription(draft.description);
    if (draft.category && categories.some((c) => c.key === draft.category)) setCategory(draft.category);
    setStep(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // The helper could not write a draft: keep what the person typed in the description.
  useEffect(() => {
    if (!prefill?.description) return;
    setDescription((cur) => cur || prefill.description);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // Editing the original text keeps the prepared versions but marks the other language out of date.
  const editOriginal = (key: string, setter: (v: string) => void) => (v: string) => {
    setter(v);
    if (bi.versions) bi.edit(bi.source, key, v);
  };

  const isWorker = !!session && role === 'worker';

  const submit = async () => {
    setServerError(null);
    setFillError(false);
    const finalTitle = bi.original('title') ?? title;
    const finalDescription = bi.original('description') ?? description;
    const result = validatePostJob({ category, title: finalTitle, description: finalDescription, city, area, preferredTime });
    if (!result.ok) {
      setErrors(result.errors);
      setStep(result.errors.category ? 1 : 2);
      return;
    }
    if (bi.hasContact()) {
      setErrors({ contact: t('ai.error.contact').en });
      return;
    }
    if (bi.incomplete()) {
      setFillError(true);
      return;
    }
    setErrors({});
    setBusy(true);
    const v = result.value;
    const { data, error } = await supabase.rpc('post_job', {
      p_title: v.title,
      p_description: v.description,
      p_category: v.category,
      p_city: v.city,
      p_location_text: v.area,
      p_preferred_time: v.preferredTime,
      p_title_i18n: bi.toI18n('title'),
      p_description_i18n: bi.toI18n('description'),
    });
    setBusy(false);
    if (error) {
      setServerError(error.message);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as { job_id: string; guest_token: string | null } | undefined;
    if (!row?.job_id) {
      setServerError('Could not post the job.');
      return;
    }
    void trackEvent('job_posted', session?.user.id ?? null, { job_id: row.job_id, guest: !session, photos: photos.length, voice: !!voice, video: !!video });
    let mediaFailed = false;
    if (session && mediaEnabled && (photos.length > 0 || voice || video)) {
      setBusy(true);
      const photoResult = photos.length > 0 ? await uploadJobPhotos(session.user.id, row.job_id, photos) : { failed: 0 };
      const voiceResult = voice ? await uploadJobVoice(session.user.id, row.job_id, voice) : { failed: 0 };
      const videoResult = video
        ? await uploadJobVideoClip(session.user.id, row.job_id, video, (f) => setUploadPct(Math.round(f * 100)))
        : { failed: 0 };
      setUploadPct(null);
      setBusy(false);
      mediaFailed = photoResult.failed + voiceResult.failed + videoResult.failed > 0;
    }
    if (row.guest_token) {
      await addGuestJob({ jobId: row.job_id, token: row.guest_token, title: v.title, createdAt: new Date().toISOString() });
      navigation.replace('PostedJob', { jobId: row.job_id, token: row.guest_token });
    } else {
      navigation.replace('PostedJob', { jobId: row.job_id, mediaFailed });
    }
  };

  const check = () => validatePostJob({ category, title, description, city, area, preferredTime });

  const next = () => {
    const result = check();
    const e = result.ok ? {} : result.errors;
    if (step === 1) {
      setErrors({ category: e.category });
      if (!e.category) setStep(2);
      return;
    }
    if (step === 2) {
      setErrors({ title: e.title, description: e.description, contact: e.contact });
      if (!e.title && !e.description && !e.contact) {
        setStep(3);
        if (!bi.versions) void bi.prepare({ title: title.trim(), description: description.trim() });
      }
    }
  };

  const categoryLabel = categories.find((c) => c.key === category)?.en ?? category;
  const mediaCount = photos.length + (voice ? 1 : 0) + (video ? 1 : 0);

  return (
    <WizardShell
      step={step}
      total={3}
      stepNameId={step === 1 ? 'post.step.media' : step === 2 ? 'post.step.details' : 'post.step.review'}
      onBack={step > 1 ? () => setStep(step - 1) : undefined}
      onStepPress={setStep}
      onNext={step === 3 ? submit : next}
      nextLabelId={step === 3 ? 'post.submit' : 'wizard.next'}
      nextIcon={step === 3 ? 'send' : 'arrow-right'}
      busy={busy}
      nextDisabled={step === 3 && (enabled === false || isWorker || bi.busy || (!!bi.versions && !bi.checked))}
      top={
        <>
          {enabled === false && <Banner id="post.disabled" tone="warning" />}
          {isWorker && <Banner id="post.workerBlocked" tone="warning" />}
          {!session && step === 1 && <Banner id="post.guestNote" tone="info" icon="user" />}
          {serverError ? <Banner text={serverError} tone="warning" /> : null}
          {uploadPct != null ? <Banner text={`Uploading video… ${uploadPct}%`} tone="info" /> : null}
          {errors.contact ? <Banner text={errors.contact} tone="warning" /> : null}
          {fillError ? <Banner id="review.fillBoth" tone="warning" /> : null}
        </>
      }
    >
      {step === 1 && (
        <>
          <Card padding="lg">
            <BiText id="post.field.category" variant="label" tone="body" style={styles.label} />
            <View style={styles.pills}>
              {categories.map((c) => (
                <Pressable
                  key={c.key}
                  onPress={() => setCategory(c.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: category === c.key }}
                  style={[styles.pill, category === c.key && styles.pillOn]}
                >
                  <Text style={[typography.label, category === c.key ? styles.pillTextOn : styles.pillText]}>
                    {c.en}
                  </Text>
                </Pressable>
              ))}
            </View>
            {errors.category ? <Text style={styles.err}>{errors.category}</Text> : null}
          </Card>
          {mediaEnabled ? (
            <Card padding="lg">
              <BiText id="post.media.hint" variant="bodySm" tone="muted" style={styles.label} />
              {session && !isWorker ? (
                <>
                  <BiText id="media.describeByVoice" variant="caption" tone="muted" style={styles.label} />
                  <VoiceRecorder value={voice} onChange={setVoice} />
                  <PhotoAttach uris={photos} onChange={setPhotos} />
                  <VideoRecorder value={video} onChange={setVideo} />
                </>
              ) : !session ? (
                <Banner id="media.signInForPhotos" tone="info" icon="camera" />
              ) : null}
            </Card>
          ) : null}
        </>
      )}

      {step === 2 && (
        <>
        {aiEnabled && !isWorker ? (
          <AiHelpButton
            subId="ai.helpMe.job"
            onPress={() =>
              navigation.navigate('AiHelper', {
                mode: 'job',
                categories: categories.map((c) => c.key),
                startText: description.trim() || undefined,
                attached: { photos: photos.length, voice: !!voice, video: !!video },
              })
            }
          />
        ) : null}
        <Card padding="lg">
          <Input labelId="post.field.title" value={title} onChangeText={editOriginal('title', setTitle)} iconLeft="edit-3" error={errors.title} />
          <Input
            labelId="post.field.description"
            value={description}
            onChangeText={editOriginal('description', setDescription)}
            multiline
            numberOfLines={4}
            style={styles.multiline}
            error={errors.description}
          />
          <PlaceSection summary={[place.areaName, place.cityName].filter(Boolean).join(', ')}>{place.fields}</PlaceSection>
          <TimeChips value={preferredTime} onChange={setPreferredTime} />
        </Card>
        </>
      )}

      {step === 3 && (
        <>
          <BiText id="post.review.hint" variant="bodySm" tone="muted" />
          {bi.busy && !bi.versions ? <Banner id="review.translating" tone="info" icon="globe" /> : null}
          {bi.error && !bi.versions ? (
            <>
              <Banner id={AI_ERROR_STRING[bi.error]} tone="warning" />
              <Banner id="review.singleLanguage" tone="info" icon="globe" />
            </>
          ) : null}
          {bi.versions ? (
            <>
              <BilingualReview
                fields={REVIEW_FIELDS}
                values={bi.versions}
                ai={bi.ai}
                stale={bi.stale}
                onChange={bi.edit}
                onUpdate={bi.update}
                updating={bi.busy}
                checked={bi.checked}
                onToggleChecked={() => bi.setChecked(!bi.checked)}
              />
              <Button labelId="review.oneLanguage" onPress={bi.reset} variant="ghost" hideUrdu />
            </>
          ) : (
            <>
              <Card padding="lg">
                <Text style={styles.reviewTitle}>{title.trim()}</Text>
                <Text style={styles.reviewBody}>{description.trim()}</Text>
              </Card>
              {!bi.busy ? (
                <Button
                  labelId="review.addManual"
                  onPress={() => bi.startManual({ title: title.trim(), description: description.trim() })}
                  variant="secondary"
                  iconLeft="globe"
                  hideUrdu
                />
              ) : null}
            </>
          )}
          <Card padding="lg">
            <View style={styles.chips}>
              <Pressable onPress={() => setStep(1)} accessibilityRole="button" accessibilityLabel={`${t('review.change').en}: ${categoryLabel}`}>
                <Chip label={categoryLabel} tone="primary" icon="tag" />
              </Pressable>
              {city.trim() ? (
                <Pressable onPress={() => setStep(2)} accessibilityRole="button" accessibilityLabel={`${t('review.change').en}: ${city.trim()}`}>
                  <Chip label={city.trim()} icon="map" />
                </Pressable>
              ) : null}
              {area.trim() ? (
                <Pressable onPress={() => setStep(2)} accessibilityRole="button" accessibilityLabel={`${t('review.change').en}: ${area.trim()}`}>
                  <Chip label={area.trim()} icon="map-pin" />
                </Pressable>
              ) : null}
              {preferredTime.trim() ? (
                <Pressable onPress={() => setStep(2)} accessibilityRole="button" accessibilityLabel={`${t('review.change').en}: ${preferredTime.trim()}`}>
                  <Chip label={preferredTime.trim()} icon="calendar" />
                </Pressable>
              ) : null}
              {mediaCount > 0 ? (
                <Chip
                  label={[
                    photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? 's' : ''}` : null,
                    video ? '1 video' : null,
                    voice ? '1 voice note' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  tone="accent"
                  icon="image"
                />
              ) : null}
            </View>
          </Card>
          <Banner id="post.privacy" tone="info" icon="lock" />
        </>
      )}
    </WizardShell>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.textBody },
  pillTextOn: { color: colors.primaryInk },
  err: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: spacing.sm },
  reviewTitle: { ...typography.title, color: colors.textStrong },
  reviewBody: { ...typography.body, color: colors.textBody },
});
