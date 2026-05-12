import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../../theme/tokens';
import { shadows } from '../../theme/shadows';

type CardTone = 'plain' | 'elevated' | 'subtle' | 'accent';

export type CardProps = PropsWithChildren<{
  tone?: CardTone;
  padding?: keyof typeof PAD;
  style?: StyleProp<ViewStyle>;
}>;

const PAD = {
  none: 0,
  sm: spacing.sm,
  md: spacing.lg,
  lg: spacing.xl,
} as const;

export function Card({ children, tone = 'plain', padding = 'md', style }: CardProps) {
  const toneStyle = TONE_STYLES[tone];
  return (
    <View
      style={[
        styles.base,
        toneStyle,
        { padding: PAD[padding] },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const TONE_STYLES: Record<CardTone, ViewStyle> = {
  plain: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  elevated: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  },
  subtle: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  accent: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    marginBottom: spacing.md,
  },
});
