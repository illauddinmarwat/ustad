import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { StringId } from '../../i18n/strings';
import { spacing } from '../../theme/tokens';

import { BiText } from './BiText';

export type ScreenHeaderProps = {
  titleId: StringId;
  subtitleId?: StringId;
  right?: React.ReactNode;
  inverse?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Top of a screen — bilingual title + optional bilingual subtitle. */
export function ScreenHeader({ titleId, subtitleId, right, inverse, style }: ScreenHeaderProps) {
  const tone = inverse ? 'inverse' : 'strong';
  const subTone = inverse ? 'inverse' : 'muted';
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.left}>
        <BiText id={titleId} variant="displayMd" tone={tone} />
        {subtitleId ? <BiText id={subtitleId} variant="body" tone={subTone} style={styles.subtitle} /> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg },
  left: { flex: 1 },
  right: { marginLeft: spacing.md },
  subtitle: { marginTop: 4 },
});
