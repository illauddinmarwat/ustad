import { StyleSheet, View } from 'react-native';

import type { StringId } from '../../i18n/strings';
import { colors, radius, spacing } from '../../theme/tokens';

import { BiText } from './BiText';
import { Button } from './Button';
import { Icon, type IconProps } from './Icon';

export type EmptyStateProps = {
  icon?: IconProps['name'];
  iconSet?: IconProps['set'];
  titleId: StringId;
  subtitleId?: StringId;
  ctaLabelId?: StringId;
  onCta?: () => void;
};

export function EmptyState({ icon = 'inbox', iconSet, titleId, subtitleId, ctaLabelId, onCta }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Icon name={icon} set={iconSet} size={24} color={colors.primaryDeep} />
      </View>
      <BiText id={titleId} variant="title" tone="strong" align="center" style={styles.title} />
      {subtitleId ? (
        <BiText id={subtitleId} variant="body" tone="muted" align="center" style={styles.subtitle} />
      ) : null}
      {ctaLabelId && onCta ? (
        <Button labelId={ctaLabelId} onPress={onCta} style={styles.cta} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { alignSelf: 'stretch' },
  subtitle: { alignSelf: 'stretch', marginTop: 4 },
  cta: { marginTop: spacing.lg, alignSelf: 'stretch' },
});
