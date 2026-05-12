import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { StringId } from '../../i18n/strings';
import { useT } from '../../i18n/useT';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography, urduTypography } from '../../theme/typography';

import { Icon, type IconProps } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  /** Translation id. The button will show EN + UR stacked unless `hideUrdu`. */
  labelId: StringId;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  iconLeft?: IconProps['name'];
  iconRight?: IconProps['name'];
  iconSet?: IconProps['set'];
  hideUrdu?: boolean;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

const variantStyles = {
  primary: { bg: colors.primary, border: colors.primary, ink: colors.primaryInk },
  secondary: { bg: colors.surface, border: colors.border, ink: colors.textStrong },
  ghost: { bg: 'transparent', border: 'transparent', ink: colors.primary },
  danger: { bg: colors.danger, border: colors.danger, ink: '#fff' },
  success: { bg: colors.accent, border: colors.accent, ink: colors.accentInk },
} as const;

const sizeStyles = {
  sm: {
    container: { minHeight: 36, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
    label: { ...typography.button, fontSize: 13 },
    urdu: { ...urduTypography.button, fontSize: 11, marginTop: 1 },
    icon: 16,
  },
  md: {
    container: { minHeight: 48, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
    label: typography.button,
    urdu: { ...urduTypography.button, marginTop: 2 },
    icon: 18,
  },
  lg: {
    container: { minHeight: 56, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
    label: { ...typography.button, fontSize: 16 },
    urdu: { ...urduTypography.button, fontSize: 13, marginTop: 2 },
    icon: 20,
  },
} as const;

export function Button({
  labelId,
  onPress,
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  iconSet,
  hideUrdu = false,
  loading = false,
  disabled = false,
  fullWidth,
  style,
}: ButtonProps) {
  const { t } = useT();
  const entry = t(labelId);

  const variantStyle = variantStyles[variant];
  const sizeStyle = sizeStyles[size];

  const inkColor = variantStyle.ink;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={entry.en}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        sizeStyle.container,
        { backgroundColor: variantStyle.bg, borderColor: variantStyle.border },
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={inkColor} />
      ) : (
        <View style={styles.row}>
          {iconLeft ? (
            <View style={styles.iconLeft}>
              <Icon name={iconLeft} set={iconSet} size={sizeStyle.icon} color={inkColor} />
            </View>
          ) : null}
          <View style={styles.labelCol}>
            <Text style={[sizeStyle.label, { color: inkColor, textAlign: 'center' }]}>{entry.en}</Text>
            {!hideUrdu ? (
              <Text style={[sizeStyle.urdu, { color: inkColor, textAlign: 'center' }]}>{entry.ur}</Text>
            ) : null}
          </View>
          {iconRight ? (
            <View style={styles.iconRight}>
              <Icon name={iconRight} set={iconSet} size={sizeStyle.icon} color={inkColor} />
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  iconLeft: { marginRight: spacing.sm },
  iconRight: { marginLeft: spacing.sm },
  labelCol: { flexShrink: 1, alignItems: 'center' },
});
