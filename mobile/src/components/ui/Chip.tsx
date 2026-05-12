import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

import { Icon, type IconProps } from './Icon';

type ChipTone = 'neutral' | 'primary' | 'accent' | 'warning' | 'danger' | 'info';

export type ChipProps = {
  label: string;
  tone?: ChipTone;
  icon?: IconProps['name'];
  iconSet?: IconProps['set'];
  style?: StyleProp<ViewStyle>;
};

const TONE: Record<ChipTone, { bg: string; ink: string; border?: string }> = {
  neutral: { bg: colors.surfaceAlt, ink: colors.textStrong, border: colors.border },
  primary: { bg: colors.primarySoft, ink: colors.primaryDeep },
  accent: { bg: colors.accentSoft, ink: '#065F46' },
  warning: { bg: colors.warningSoft, ink: '#92400E' },
  danger: { bg: colors.dangerSoft, ink: '#991B1B' },
  info: { bg: colors.infoSoft, ink: '#075985' },
};

export function Chip({ label, tone = 'neutral', icon, iconSet, style }: ChipProps) {
  const t = TONE[tone];
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: t.bg, borderColor: t.border ?? t.bg },
        style,
      ]}
    >
      {icon ? (
        <View style={styles.icon}>
          <Icon name={icon} set={iconSet} size={12} color={t.ink} />
        </View>
      ) : null}
      <Text style={[styles.label, { color: t.ink }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  icon: { marginRight: 4 },
  label: { ...typography.caption, fontWeight: '600' },
});
