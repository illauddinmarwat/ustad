/**
 * Back-compat layer for the original primitives.
 *
 * The new design system lives in sibling files (`BiText`, `Button`, `Card`,
 * `Input`, `Chip`, `Avatar`, `EmptyState`, `ScreenHeader`, `Icon`,
 * `TabBarLabel`). These older exports are preserved so screens that still
 * use them keep compiling, but they now read from the v2 design tokens so
 * the rebrand applies uniformly.
 */
import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

export { BiText } from './BiText';
export type { BiTextProps } from './BiText';
export { Button } from './Button';
export type { ButtonProps } from './Button';
export { Card } from './Card';
export type { CardProps } from './Card';
export { Input } from './Input';
export type { InputProps } from './Input';
export { Chip } from './Chip';
export type { ChipProps } from './Chip';
export { Avatar } from './Avatar';
export type { AvatarProps } from './Avatar';
export { Banner } from './Banner';
export type { BannerProps } from './Banner';
export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';
export { ScreenHeader } from './ScreenHeader';
export type { ScreenHeaderProps } from './ScreenHeader';
export { Icon } from './Icon';
export type { IconProps } from './Icon';
export { TabBarLabel } from './TabBarLabel';
export type { TabBarLabelProps } from './TabBarLabel';

export function AppCard({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

export function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      style={styles.primaryBtn}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

export function StatusPill({ label }: { label: string }) {
  const lower = label.toLowerCase();
  const bg = lower.includes('complete')
    ? colors.successSoft
    : lower.includes('cancel')
    ? colors.dangerSoft
    : colors.primarySoft;
  const ink = lower.includes('complete')
    ? '#065F46'
    : lower.includes('cancel')
    ? '#991B1B'
    : colors.primaryDeep;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: ink }]}>{label}</Text>
    </View>
  );
}

/**
 * Explainability chip used by ranked listings (Phase 3) — surfaces the signal
 * (e.g. rating, response speed) so customers know why an item is shown.
 */
export function ExplainChip({ label }: { label: string }) {
  return (
    <View style={styles.explainChip}>
      <Text style={styles.explainChipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.title, color: colors.textStrong },
  subtitle: { ...typography.bodySm, color: colors.textMuted, marginTop: 4 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { ...typography.button, color: colors.primaryInk },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  pillText: { ...typography.caption, fontWeight: '700' },
  explainChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    alignSelf: 'flex-start',
  },
  explainChipText: { ...typography.caption, color: colors.primaryDeep, fontWeight: '600' },
});
