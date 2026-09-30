import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { StringId } from '../i18n/strings';
import { useT } from '../i18n/useT';
import { AVAILABILITY_OPTIONS, type AvailabilityKey, type PriceType } from '../lib/quoteDetails';
import { colors, radius, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { BiText } from './ui/BiText';

type Props = {
  priceType: PriceType;
  onPriceType: (p: PriceType) => void;
  availability: AvailabilityKey | null;
  onAvailability: (k: AvailabilityKey) => void;
  error?: string | null;
};

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.pill, active && styles.pillOn]}
    >
      <Text style={[typography.label, active ? styles.pillTextOn : styles.pillText]}>{label}</Text>
    </Pressable>
  );
}

/** The extra fields on a worker's quote: fixed price or estimate, and when they can start. */
export function QuoteFields({ priceType, onPriceType, availability, onAvailability, error }: Props) {
  const { t } = useT();
  return (
    <View style={styles.wrap}>
      <BiText id="quote.priceType" variant="label" tone="body" style={styles.label} />
      <View style={styles.row}>
        <Pill label={t('quote.fixed').en} active={priceType === 'fixed'} onPress={() => onPriceType('fixed')} />
        <Pill label={t('quote.estimate').en} active={priceType === 'estimate'} onPress={() => onPriceType('estimate')} />
      </View>
      {priceType === 'estimate' ? <BiText id="quote.estimateHint" variant="caption" tone="muted" /> : null}

      <BiText id="quote.available" variant="label" tone="body" style={[styles.label, styles.gapTop]} />
      <View style={styles.row}>
        {AVAILABILITY_OPTIONS.map((o) => (
          <Pill
            key={o.key}
            label={t(`quote.avail.${o.key}` as StringId).en}
            active={availability === o.key}
            onPress={() => onAvailability(o.key)}
          />
        ))}
      </View>
      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { marginBottom: spacing.sm },
  gapTop: { marginTop: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.textBody },
  pillTextOn: { color: colors.primaryInk },
  err: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
});
