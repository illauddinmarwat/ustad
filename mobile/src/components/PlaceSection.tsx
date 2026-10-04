import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '../i18n/useT';
import { colors, radius, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { BiText } from './ui/BiText';
import { Icon } from './ui/Icon';

type Props = {
  /** What was chosen, for example "Gulshan, Karachi". Empty until something is chosen. */
  summary: string;
  children: React.ReactNode;
};

/**
 * One row for "where is the work": it shows the place chosen (or asks to choose one) and opens the city, area,
 * my-location and map fields only when tapped, so the form stays short.
 */
export function PlaceSection({ summary, children }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('place.where').en}
        style={styles.row}
      >
        <Icon name="map-pin" size={18} color={colors.primary} />
        <View style={styles.text}>
          <BiText id="place.where" variant="caption" tone="muted" />
          <Text style={[typography.subtitle, summary ? styles.chosen : styles.placeholder]} numberOfLines={1}>
            {summary || t('place.choose').en}
          </Text>
        </View>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  text: { flex: 1 },
  chosen: { color: colors.textStrong },
  placeholder: { color: colors.textMuted },
  body: { padding: spacing.md, paddingTop: 0, borderTopWidth: 1, borderTopColor: colors.divider },
});
