import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import type { StringId } from '../../i18n/strings';
import { useT } from '../../i18n/useT';
import { colors } from '../../theme/tokens';
import { typography, urduTypography, type TypeVariant } from '../../theme/typography';

type Tone = 'strong' | 'body' | 'muted' | 'inverse';

const TONE_MAP: Record<Tone, { en: string; ur: string }> = {
  strong: { en: colors.textStrong, ur: colors.textBody },
  body: { en: colors.textBody, ur: colors.textMuted },
  muted: { en: colors.textMuted, ur: colors.textMuted },
  inverse: { en: colors.textInverse, ur: 'rgba(255,255,255,0.85)' },
};

type Alignment = 'auto' | 'left' | 'center' | 'right';

export type BiTextProps = {
  /** Stable id from `strings.ts`. */
  id: StringId;
  /** Type scale. Defaults to `body`. */
  variant?: TypeVariant;
  /** Color tone. */
  tone?: Tone;
  /** Alignment of the English line. The Urdu line is always right-aligned (RTL). */
  align?: Alignment;
  /** Hide the Urdu sub-line. Use sparingly (e.g. inside very tight chips). */
  hideUrdu?: boolean;
  style?: StyleProp<ViewStyle>;
  enStyle?: StyleProp<TextStyle>;
  urStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

/**
 * BiText — renders English on line 1 and Urdu on line 2.
 *
 * The Urdu line is intentionally smaller and slightly muted so the English
 * reads first. The full UI stays LTR; only the Urdu line uses
 * `writingDirection: 'rtl'` and `textAlign: 'right'`.
 */
export function BiText({
  id,
  variant = 'body',
  tone = 'body',
  align = 'auto',
  hideUrdu = false,
  style,
  enStyle,
  urStyle,
  numberOfLines,
}: BiTextProps) {
  const { t } = useT();
  const entry = t(id);
  const enType = typography[variant];
  const urType = urduTypography[variant];
  const colorPair = TONE_MAP[tone];

  const enAlign = align === 'auto' ? 'left' : align;
  // Urdu defaults to right (natural RTL reading position) when no explicit
  // alignment is requested, but must follow an explicit `align` (e.g.
  // "center") — otherwise centered layouts (like category cards) end up
  // with English centered and Urdu still pinned right, which reads as
  // overlapping/misaligned in tight containers.
  const urAlign = align === 'auto' ? 'right' : align;

  return (
    <View style={style}>
      <Text
        style={[enType, { color: colorPair.en, textAlign: enAlign }, enStyle]}
        numberOfLines={numberOfLines}
        allowFontScaling
      >
        {entry.en}
      </Text>
      {!hideUrdu && (
        <Text
          style={[
            urType,
            styles.urdu,
            { color: colorPair.ur, textAlign: urAlign },
            urStyle,
          ]}
          numberOfLines={numberOfLines}
          allowFontScaling
        >
          {entry.ur}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  urdu: {
    writingDirection: 'rtl',
    marginTop: 2,
  },
});
