import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '../i18n/useT';
import type { QuoteSort } from '../lib/quoteDetails';
import { colors, radius, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

const MODES: QuoteSort[] = ['price', 'rating', 'soonest'];

/** Lets the customer reorder quotes by price, rating or start date. */
export function QuoteSortBar({ value, onChange }: { value: QuoteSort; onChange: (s: QuoteSort) => void }) {
  const { t } = useT();
  return (
    <View style={styles.row}>
      <Text style={[typography.caption, styles.label]}>{t('quote.sortBy').en}</Text>
      {MODES.map((m) => (
        <Pressable
          key={m}
          onPress={() => onChange(m)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === m }}
          style={[styles.pill, value === m && styles.pillOn]}
        >
          <Text style={[typography.caption, value === m ? styles.pillTextOn : styles.pillText]}>
            {t(`quote.sort.${m}`).en}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  label: { color: colors.textMuted },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.textBody },
  pillTextOn: { color: colors.primaryInk },
});
