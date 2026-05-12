import { StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';

export type AvatarProps = {
  name?: string | null;
  size?: number;
  tone?: 'primary' | 'accent' | 'neutral';
};

function initials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

const TONE = {
  primary: { bg: colors.primarySoft, ink: colors.primaryDeep },
  accent: { bg: colors.accentSoft, ink: '#065F46' },
  neutral: { bg: colors.surfaceAlt, ink: colors.textStrong },
};

export function Avatar({ name, size = 40, tone = 'primary' }: AvatarProps) {
  const t = TONE[tone];
  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: radius.pill, backgroundColor: t.bg },
      ]}
    >
      <Text style={[typography.subtitle, { color: t.ink, fontSize: size * 0.4 }]}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
