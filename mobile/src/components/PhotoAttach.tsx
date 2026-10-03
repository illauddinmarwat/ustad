import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '../i18n/useT';
import { MAX_PHOTOS } from '../lib/jobMedia';
import { pickImage, type ImageSource } from '../lib/pickImage';
import { colors, radius, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

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
  const room = MAX_PHOTOS - alreadyAttached - uris.length;

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
  thumbWrap: { width: 76, height: 76 },
  thumb: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.border },
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
    width: 76,
    height: 76,
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
