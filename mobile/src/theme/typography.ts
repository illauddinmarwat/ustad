/**
 * Type system — Manrope (body/UI), Space Grotesk (display), Noto Nastaliq Urdu (Urdu line).
 * Font family names below match the keys we register with `useFonts` in `App.tsx`.
 */
import type { TextStyle } from 'react-native';

export const fontFamilies = {
  // Body / UI
  bodyRegular: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemiBold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  // Display
  displaySemiBold: 'SpaceGrotesk_600SemiBold',
  displayBold: 'SpaceGrotesk_700Bold',
  // Urdu (Noto Nastaliq Urdu — flowing nastaliq style)
  urdu: 'NotoNastaliqUrdu_400Regular',
  urduBold: 'NotoNastaliqUrdu_600SemiBold',
} as const;

export type TypeVariant =
  | 'displayLg'
  | 'displayMd'
  | 'title'
  | 'subtitle'
  | 'body'
  | 'bodySm'
  | 'label'
  | 'button'
  | 'caption'
  | 'overline';

export const typography: Record<TypeVariant, TextStyle> = {
  displayLg: {
    fontFamily: fontFamilies.displayBold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  displayMd: {
    fontFamily: fontFamilies.displayBold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  title: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 18,
    lineHeight: 24,
  },
  subtitle: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 15,
    lineHeight: 22,
  },
  body: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 15,
    lineHeight: 22,
  },
  bodySm: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 13,
    lineHeight: 20,
  },
  label: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  caption: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 12,
    lineHeight: 16,
  },
  overline: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
};

/** Urdu variant sizing tuned to look balanced beneath the English line. */
export const urduTypography: Record<TypeVariant, TextStyle> = {
  displayLg: { fontFamily: fontFamilies.urduBold, fontSize: 22, lineHeight: 34 },
  displayMd: { fontFamily: fontFamilies.urduBold, fontSize: 18, lineHeight: 28 },
  title: { fontFamily: fontFamilies.urduBold, fontSize: 15, lineHeight: 24 },
  subtitle: { fontFamily: fontFamilies.urdu, fontSize: 13, lineHeight: 22 },
  body: { fontFamily: fontFamilies.urdu, fontSize: 13, lineHeight: 22 },
  bodySm: { fontFamily: fontFamilies.urdu, fontSize: 12, lineHeight: 20 },
  label: { fontFamily: fontFamilies.urdu, fontSize: 11, lineHeight: 18 },
  button: { fontFamily: fontFamilies.urdu, fontSize: 12, lineHeight: 18 },
  caption: { fontFamily: fontFamilies.urdu, fontSize: 10, lineHeight: 16 },
  overline: { fontFamily: fontFamilies.urdu, fontSize: 10, lineHeight: 14 },
};
