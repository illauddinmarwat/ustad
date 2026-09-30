import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';

import { useT } from '../i18n/useT';
import {
  fetchJobMediaEnabled,
  loadJobMedia,
  removeJobMedia,
  uploadJobPhotos,
  type JobMediaItem,
} from '../lib/jobMedia';
import { colors, radius, spacing } from '../theme/tokens';

import { PhotoAttach } from './PhotoAttach';
import { Banner } from './ui/Banner';
import { BiText } from './ui/BiText';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Icon } from './ui/Icon';

type Props = {
  jobId: string;
  /** Set for the customer who owns the job: they can add and remove photos while it is open. */
  ownerId?: string | null;
  /** Bump to reload after the parent changed something. */
  refreshKey?: number;
};

/** Photos on a job. Renders nothing when the feature is off or there is nothing to show (and nothing to add). */
export function JobMediaGallery({ jobId, ownerId = null, refreshKey = 0 }: Props) {
  const { t } = useT();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [items, setItems] = useState<JobMediaItem[]>([]);
  const [pending, setPending] = useState<string[]>([]);
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
  if (photos.length === 0 && !ownerId) return null;

  const remove = async (id: string) => {
    setError(null);
    try {
      await removeJobMedia(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the photo.');
    }
  };

  const upload = async () => {
    if (!ownerId || pending.length === 0) return;
    setBusy(true);
    setError(null);
    const { failed } = await uploadJobPhotos(ownerId, jobId, pending);
    setBusy(false);
    setPending([]);
    if (failed > 0) setError(t('media.uploadFailed').en);
    await load();
  };

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
            {ownerId ? (
              <Pressable
                onPress={() => remove(p.id)}
                accessibilityRole="button"
                accessibilityLabel={t('media.remove').en}
                style={styles.remove}
                hitSlop={8}
              >
                <Icon name="x" size={14} color="#fff" />
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      {photos.length === 0 ? <BiText id="media.none" variant="body" tone="muted" /> : null}

      {ownerId ? (
        <>
          <PhotoAttach uris={pending} onChange={setPending} alreadyAttached={photos.length} />
          {pending.length > 0 ? (
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
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  full: { width: '100%', height: '100%' },
});
