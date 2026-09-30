import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhotoAttach } from '../../components/PhotoAttach';
import { VideoRecorder } from '../../components/VideoRecorder';
import { VoiceRecorder } from '../../components/VoiceRecorder';
import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n/useT';
import { trackEvent } from '../../lib/analytics';
import { fetchJobMediaEnabled, uploadJobPhotos, uploadJobVideoClip, uploadJobVoice } from '../../lib/jobMedia';
import {
  addGuestJob,
  fetchJobPostingEnabled,
  validatePostJob,
  type PostJobErrors,
} from '../../lib/jobPosting';
import { useSkillCategories } from '../../lib/skillCategories';
import { supabase } from '../../lib/supabase';
import type { VideoClip } from '../../lib/videoNote';
import type { VoiceNote } from '../../lib/voiceNote';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PostJob'>;

export default function PostJobScreen() {
  const navigation = useNavigation<Nav>();
  const { session, role } = useAuth();
  const { t } = useT();
  const categories = useSkillCategories();
  const insets = useSafeAreaInsets();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [voice, setVoice] = useState<VoiceNote | null>(null);
  const [video, setVideo] = useState<VideoClip | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [mediaEnabled, setMediaEnabled] = useState(false);
  const [preferredTime, setPreferredTime] = useState('');
  const [errors, setErrors] = useState<PostJobErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchJobPostingEnabled().then(setEnabled);
    fetchJobMediaEnabled().then(setMediaEnabled);
  }, []);

  const isWorker = !!session && role === 'worker';

  const submit = async () => {
    setServerError(null);
    const result = validatePostJob({ category, title, description, city, area, preferredTime });
    if (!result.ok) {
      setErrors(result.errors);
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

  return (
    <ScrollView
      contentContainerStyle={[styles.root, { paddingBottom: insets.bottom + spacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader titleId="post.title" subtitleId="post.subtitle" />

      {enabled === false && <Banner id="post.disabled" tone="warning" />}
      {isWorker && <Banner id="post.workerBlocked" tone="warning" />}
      {!session && <Banner id="post.guestNote" tone="info" icon="user" />}
      {serverError ? <Banner text={serverError} tone="warning" /> : null}
      {uploadPct != null ? <Banner text={`Uploading video… ${uploadPct}%`} tone="info" /> : null}
      {errors.contact ? <Banner text={errors.contact} tone="warning" /> : null}

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

        <Input labelId="post.field.title" value={title} onChangeText={setTitle} iconLeft="edit-3" error={errors.title} />
        <Input
          labelId="post.field.description"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          style={styles.multiline}
          error={errors.description}
        />
        <Input labelId="post.field.city" value={city} onChangeText={setCity} iconLeft="map" />
        <Input labelId="post.field.area" value={area} onChangeText={setArea} iconLeft="map-pin" />
        <Input labelId="post.field.time" value={preferredTime} onChangeText={setPreferredTime} iconLeft="calendar" />

        {mediaEnabled ? (
          session && !isWorker ? (
            <>
              <PhotoAttach uris={photos} onChange={setPhotos} />
              <VoiceRecorder value={voice} onChange={setVoice} />
              <VideoRecorder value={video} onChange={setVideo} />
            </>
          ) : !session ? (
            <Banner id="media.signInForPhotos" tone="info" icon="camera" />
          ) : null
        ) : null}

        <Banner id="post.privacy" tone="info" icon="lock" />
        <View style={styles.submit}>
          <Button
            labelId="post.submit"
            onPress={submit}
            iconLeft="send"
            fullWidth
            disabled={busy || enabled === false || isWorker}
          />
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1 },
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
  submit: { marginTop: spacing.md },
});
