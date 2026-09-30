import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';

import { useT } from '../i18n/useT';
import {
  fetchJobMediaEnabled,
  loadJobMedia,
  removeJobMedia,
  uploadJobPhotos,
  uploadJobVideoClip,
  uploadJobVoice,
  type JobMediaItem,
} from '../lib/jobMedia';
import type { VideoClip } from '../lib/videoNote';
import type { VoiceNote } from '../lib/voiceNote';
import { colors, radius, spacing } from '../theme/tokens';

import { PhotoAttach } from './PhotoAttach';
import { VideoPlayer, VideoRecorder } from './VideoRecorder';
import { VoicePlayer, VoiceRecorder } from './VoiceRecorder';
import { Banner } from './ui/Banner';
import { BiText } from './ui/BiText';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Icon } from './ui/Icon';

type Props = {
  jobId: string;
  /** Set for the customer who owns the job: they can add and remove photos and a voice note while it is open. */
  ownerId?: string | null;
  /** Bump to reload after the parent changed something. */
  refreshKey?: number;
};

/** Photos and the voice note on a job. Renders nothing when the feature is off or there is nothing to show (and nothing to add). */
export function JobMediaGallery({ jobId, ownerId = null, refreshKey = 0 }: Props) {
  const { t } = useT();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [items, setItems] = useState<JobMediaItem[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [pendingVoice, setPendingVoice] = useState<VoiceNote | null>(null);
  const [pendingVideo, setPendingVideo] = useState<VideoClip | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(await loadJobMedia(jobId));
  }, [jobId]);

  useEffect(() => {
    fetchJobMediaEnabled().then(setEnabled);
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load, refreshKey]);

  if (!enabled) return null;
  const photos = items.filter((i) => i.kind === 'photo');
  const voice = items.find((i) => i.kind === 'audio') ?? null;
  const clip = items.find((i) => i.kind === 'video') ?? null;
  if (items.length === 0 && !ownerId) return null;

  const remove = async (id: string) => {
    setError(null);
    try {
      await removeJobMedia(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the file.');
    }
  };

  const upload = async () => {
    if (!ownerId || (pending.length === 0 && !pendingVoice && !pendingVideo)) return;
    setBusy(true);
    setError(null);
    const photoResult = pending.length > 0 ? await uploadJobPhotos(ownerId, jobId, pending) : { failed: 0 };
    const voiceResult = pendingVoice ? await uploadJobVoice(ownerId, jobId, pendingVoice) : { failed: 0 };
    const videoResult = pendingVideo
      ? await uploadJobVideoClip(ownerId, jobId, pendingVideo, (f) => setPct(Math.round(f * 100)))
      : { failed: 0, tooLarge: false };
    setPct(null);
    setBusy(false);
    setPending([]);
    setPendingVoice(null);
    setPendingVideo(null);
    if (videoResult.tooLarge) setError(t('media.videoTooLarge').en);
    else if (photoResult.failed + voiceResult.failed + videoResult.failed > 0) setError(t('media.uploadFailed').en);
    await load();
  };

  const removeButton = (id: string) =>
    ownerId ? (
      <Pressable
        onPress={() => remove(id)}
        accessibilityRole="button"
        accessibilityLabel={t('media.remove').en}
        style={styles.remove}
        hitSlop={8}
      >
        <Icon name="x" size={14} color="#fff" />
      </Pressable>
    ) : null;

  return (
    <Card padding="lg">
      <BiText id="media.photos" variant="title" tone="strong" style={styles.gap} />
      <View style={styles.grid}>
        {photos.map((p) => (
          <View key={p.id} style={styles.cell}>
            <Pressable
              onPress={() => p.url && setViewing(p.url)}
              accessibilityRole="imagebutton"
              accessibilityLabel={t('media.openPhoto').en}
            >
              {p.url ? (
                <Image source={{ uri: p.url }} style={styles.thumb} accessibilityIgnoresInvertColors />
              ) : (
                <View style={[styles.thumb, styles.missing]}>
                  <Icon name="image" size={22} color={colors.textMuted} />
                </View>
              )}
            </Pressable>
            {removeButton(p.id)}
          </View>
        ))}
      </View>
      {photos.length === 0 ? <BiText id="media.none" variant="body" tone="muted" style={styles.gap} /> : null}

      <BiText id="media.voice" variant="label" tone="body" style={styles.gap} />
      {voice ? (
        <View style={styles.voiceRow}>
          {voice.url ? <VoicePlayer uri={voice.url} seconds={voice.duration_s} /> : <BiText id="media.recordFailed" variant="caption" tone="muted" />}
          {ownerId ? (
            <Pressable
              onPress={() => remove(voice.id)}
              accessibilityRole="button"
              accessibilityLabel={t('media.remove').en}
              hitSlop={8}
              style={styles.voiceRemove}
            >
              <Icon name="trash-2" size={18} color={colors.danger} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <BiText id="media.voiceNone" variant="body" tone="muted" style={styles.gap} />
      )}

      <BiText id="media.video" variant="label" tone="body" style={styles.gap} />
      {clip ? (
        <View style={styles.voiceRow}>
          <View style={styles.videoBox}>
            {clip.url ? <VideoPlayer uri={clip.url} /> : <BiText id="media.recordFailed" variant="caption" tone="muted" />}
          </View>
          {ownerId ? (
            <Pressable
              onPress={() => remove(clip.id)}
              accessibilityRole="button"
              accessibilityLabel={t('media.remove').en}
              hitSlop={8}
              style={styles.voiceRemove}
            >
              <Icon name="trash-2" size={18} color={colors.danger} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <BiText id="media.videoNone" variant="body" tone="muted" style={styles.gap} />
      )}

      {ownerId ? (
        <>
          <PhotoAttach uris={pending} onChange={setPending} alreadyAttached={photos.length} />
          {!voice ? <VoiceRecorder value={pendingVoice} onChange={setPendingVoice} /> : null}
          {!clip ? <VideoRecorder value={pendingVideo} onChange={setPendingVideo} /> : null}
          {pct != null ? <Banner text={`Uploading video… ${pct}%`} tone="info" /> : null}
          {pending.length > 0 || pendingVoice || pendingVideo ? (
            <Button labelId="media.upload" onPress={upload} iconLeft="upload" fullWidth disabled={busy} loading={busy} />
          ) : null}
        </>
      ) : null}
      {error ? <Banner text={error} tone="warning" /> : null}

      <Modal visible={viewing !== null} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)} accessibilityRole="button">
          {viewing ? <Image source={{ uri: viewing }} style={styles.full} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  cell: { width: 96, height: 96 },
  thumb: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.border },
  missing: { alignItems: 'center', justifyContent: 'center' },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  voiceRemove: { padding: spacing.sm },
  videoBox: { flex: 1 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  full: { width: '100%', height: '100%' },
});
