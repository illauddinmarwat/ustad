/**
 * Type system — Manrope (body/UI), Space Grotesk (display), Noto Naskh Arabic (Urdu line).
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
  // Urdu — Noto Naskh Arabic: as tall as Manrope, so it is never clipped. To use Jameel Noori Nastaleeq instead,
  // load it in App.tsx and change these two names (and raise urduTypography line heights to about 2x the size).
  urdu: 'NotoNaskhArabic_400Regular',
  urduBold: 'NotoNaskhArabic_700Bold',
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

/** Urdu variant sizing: about the English size, with a line height that leaves room for the marks above and below. */
export const urduTypography: Record<TypeVariant, TextStyle> = {
  displayLg: { fontFamily: fontFamilies.urduBold, fontSize: 28, lineHeight: 44 },
  displayMd: { fontFamily: fontFamilies.urduBold, fontSize: 22, lineHeight: 36 },
  title: { fontFamily: fontFamilies.urduBold, fontSize: 17, lineHeight: 28 },
  subtitle: { fontFamily: fontFamilies.urdu, fontSize: 15, lineHeight: 26 },
  body: { fontFamily: fontFamilies.urdu, fontSize: 15, lineHeight: 26 },
  bodySm: { fontFamily: fontFamilies.urdu, fontSize: 13, lineHeight: 22 },
  label: { fontFamily: fontFamilies.urdu, fontSize: 13, lineHeight: 22 },
  button: { fontFamily: fontFamilies.urdu, fontSize: 15, lineHeight: 26 },
  caption: { fontFamily: fontFamilies.urdu, fontSize: 12, lineHeight: 20 },
  overline: { fontFamily: fontFamilies.urdu, fontSize: 11, lineHeight: 18 },
};
