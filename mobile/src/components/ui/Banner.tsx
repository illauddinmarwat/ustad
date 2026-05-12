import { StyleSheet, Text, View } from 'react-native';

import type { StringId } from '../../i18n/strings';
import { useT } from '../../i18n/useT';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography, urduTypography } from '../../theme/typography';

import { Icon, type IconProps } from './Icon';

type Tone = 'info' | 'success' | 'warning' | 'danger';

export type BannerProps = {
  /** Translated id (preferred). */
  id?: StringId;
  /** Raw text fallback (e.g. Supabase error.message). Stays English. */
  text?: string | null;
  tone?: Tone;
  icon?: IconProps['name'];
};

const TONE: Record<Tone, { bg: string; border: string; ink: string; icon: IconProps['name'] }> = {
  info: { bg: colors.primarySoft, border: colors.primarySoft, ink: colors.primaryDeep, icon: 'info' },
  success: { bg: colors.accentSoft, border: colors.accentSoft, ink: '#065F46', icon: 'check-circle' },
  warning: { bg: colors.warningSoft, border: colors.warningSoft, ink: '#92400E', icon: 'alert-triangle' },
  danger: { bg: colors.dangerSoft, border: colors.dangerSoft, ink: '#991B1B', icon: 'alert-octagon' },
};

export function Banner({ id, text, tone = 'info', icon }: BannerProps) {
  const { t } = useT();
  const entry = id ? t(id) : null;
  const palette = TONE[tone];
  const resolvedIcon = icon ?? palette.icon;

  if (!entry && !text) return null;

  return (
    <View style={[styles.wrap, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Icon name={resolvedIcon} size={16} color={palette.ink} />
      <View style={styles.body}>
        {entry ? (
          <>
            <Text style={[typography.bodySm, { color: palette.ink }]}>{entry.en}</Text>
            <Text style={[urduTypography.bodySm, { color: palette.ink, textAlign: 'right', writingDirection: 'rtl', marginTop: 2 }]}>
              {entry.ur}
            </Text>
          </>
        ) : (
          <Text style={[typography.bodySm, { color: palette.ink }]}>{text}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  body: { flex: 1, marginLeft: spacing.sm },
});
