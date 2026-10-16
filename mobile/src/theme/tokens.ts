/**
 * Design tokens (v2) — Ustad brand green, matching the reference blueprints.
 *
 * Use these instead of hardcoded hex values. Older keys (`primarySoft`,
 * `successSoft`, etc.) are preserved as aliases so existing screens keep
 * compiling while we migrate.
 */

export const colors = {
  // Surfaces
  bg: '#F4FBF6',
  surface: '#FFFFFF',
  surfaceAlt: '#EAF6EE',
  border: '#DCEFE1',
  divider: '#E7F3EA',

  // Brand
  primary: '#15803D',
  primaryDeep: '#14532D',
  primarySoft: '#DCFCE7',
  primaryInk: '#FFFFFF',

  // Accent (verification, trust, success)
  accent: '#16A34A',
  accentSoft: '#DCFCE7',
  accentInk: '#FFFFFF',

  // Status
  warning: '#F59E0B',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  info: '#0EA5E9',
  infoSoft: '#E0F2FE',

  // Deep inks for text on the soft status tints, and a pale tint for text on solid green
  accentDeep: '#065F46',
  warningDeep: '#92400E',
  dangerDeep: '#991B1B',
  infoDeep: '#075985',
  primaryTint: '#D1FAE5',

  // Text
  textStrong: '#0B0F19',
  textBody: '#384151',
  textMuted: '#6B7280',
  textInverse: '#FFFFFF',

  // Soft tints used historically (kept for back-compat)
  successSoft: '#DCFCE7',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;
