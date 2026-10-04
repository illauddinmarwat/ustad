import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '../i18n/useT';
import { checkImageQuality, type QualityVerdict } from '../lib/imageQuality';
import { MAX_PHOTOS } from '../lib/jobMedia';
import { pickImage, type ImageSource } from '../lib/pickImage';
import { colors, radius, spacing } from '../theme/tokens';
import { typography, urduTypography } from '../theme/typography';

import { BiText } from './ui/BiText';
import { Banner } from './ui/Banner';
import { Icon } from './ui/Icon';
import { ImageSourceSheet } from './ui/ImageSourceSheet';

type Props = {
  uris: string[];
  onChange: (uris: string[]) => void;
  /** Extra slots already used (photos already on the job), so the total stays within the cap. */
  alreadyAttached?: number;
  /** Leave out the line about quoting a job (used where the photos are not for a job). */
  hideHint?: boolean;
};

/** Pick up to four photos (camera or gallery) and show removable thumbnails. */
export function PhotoAttach({ uris, onChange, alreadyAttached = 0, hideHint }: Props) {
  const { t } = useT();
  const [sheet, setSheet] = useState(false);
  const [denied, setDenied] = useState(false);
  const [quality, setQuality] = useState<Record<string, QualityVerdict | null>>({});
  const room = MAX_PHOTOS - alreadyAttached - uris.length;

  // Each new photo gets a short, friendly note about its quality, worked out on the phone.
  useEffect(() => {
    const todo = uris.filter((u) => !(u in quality));
    if (todo.length === 0) return;
    let live = true;
    setQuality((q) => ({ ...q, ...Object.fromEntries(todo.map((u) => [u, null])) }));
    todo.forEach((u) => {
      void checkImageQuality(u).then((v) => {
        if (live) setQuality((q) => ({ ...q, [u]: v }));
      });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uris]);

  const onPickSource = async (source: ImageSource) => {
    setSheet(false);
    setDenied(false);
    const result = await pickImage(source);
    if (result.status === 'denied') setDenied(true);
    else if (result.status === 'ok') onChange([...uris, result.uri].slice(0, MAX_PHOTOS - alreadyAttached));
  };

  return (
    <View style={styles.wrap}>
      <BiText id="media.photos" variant="label" tone="body" style={styles.label} />
      <View style={styles.row}>
        {uris.map((uri) => (
          <View key={uri} style={styles.thumbWrap}>
            <Image source={{ uri }} style={styles.thumb} accessibilityIgnoresInvertColors />
            {quality[uri] ? (
              <View style={[styles.note, quality[uri] === 'good' ? styles.noteGood : styles.noteWarn]} accessibilityLabel={t(`media.quality.${quality[uri]}`).en}>
                <Text style={[styles.noteText, quality[uri] === 'good' ? styles.noteTextGood : styles.noteTextWarn]} numberOfLines={2}>
                  {t(`media.quality.${quality[uri]}`).en}
                </Text>
                <Text style={[styles.noteUr, quality[uri] === 'good' ? styles.noteTextGood : styles.noteTextWarn]} numberOfLines={2}>
                  {t(`media.quality.${quality[uri]}`).ur}
                </Text>
              </View>
            ) : null}
            <Pressable
              onPress={() => onChange(uris.filter((u) => u !== uri))}
              accessibilityRole="button"
              accessibilityLabel={t('media.remove').en}
              style={styles.remove}
              hitSlop={8}
            >
              <Icon name="x" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        {room > 0 ? (
          <Pressable
            onPress={() => setSheet(true)}
            accessibilityRole="button"
            accessibilityLabel={t('media.addPhoto').en}
            style={styles.add}
          >
            <Icon name="camera" size={22} color={colors.primary} />
            <Text style={[typography.caption, styles.addText]}>{t('media.addPhoto').en}</Text>
          </Pressable>
        ) : null}
      </View>
      {hideHint ? null : <BiText id="media.photoHint" variant="caption" tone="muted" />}
      {denied ? <Banner id="image.permissionDenied" tone="warning" /> : null}
      <ImageSourceSheet visible={sheet} onPick={onPickSource} onClose={() => setSheet(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs },
  thumbWrap: { width: 120, height: 120 },
  thumb: { width: 120, height: 120, borderRadius: radius.md, backgroundColor: colors.border },
  note: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: radius.md,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  noteGood: { backgroundColor: 'rgba(209,250,229,0.95)' },
  noteWarn: { backgroundColor: 'rgba(254,243,199,0.95)' },
  noteText: { ...typography.caption, fontSize: 10, lineHeight: 13, fontWeight: '700', textAlign: 'center' },
  noteUr: { ...urduTypography.caption, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  noteTextGood: { color: '#065F46' },
  noteTextWarn: { color: '#92400E' },
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
  add: {
    width: 120,
    height: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addText: { color: colors.primary },
});
