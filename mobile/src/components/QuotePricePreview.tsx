import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useT } from '../i18n/useT';
import { fetchQuotePreview, parsePreviewAmount, type QuotePreview } from '../lib/quotePricing';
import { colors, radius, spacing } from '../theme/tokens';
import { typography, urduTypography } from '../theme/typography';

const DEBOUNCE_MS = 300;

/**
 * Live preview under a worker's price field: what the customer will see, the platform fee and what the
 * worker keeps. Renders nothing when the amount is empty or the commission markup is off.
 */
export function QuotePricePreview({ amount }: { amount: string }) {
  const { t } = useT();
  const [preview, setPreview] = useState<QuotePreview | null>(null);

  useEffect(() => {
    const value = parsePreviewAmount(amount);
    if (value == null) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchQuotePreview(value).then((p) => {
        if (!cancelled) setPreview(p);
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [amount]);

  const value = parsePreviewAmount(amount);
  if (!preview || value == null) return null;

  const row = (id: 'quote.preview.customer' | 'quote.preview.fee' | 'quote.preview.keep', amountPkr: number, strong = false) => (
    <View style={styles.row}>
      <View style={styles.label}>
        <Text style={[typography.bodySm, { color: colors.textBody }]}>{t(id).en}</Text>
        <Text style={[urduTypography.bodySm, styles.ur]}>{t(id).ur}</Text>
      </View>
      <Text style={strong ? styles.strong : styles.amount}>Rs {amountPkr}</Text>
    </View>
  );

  return (
    <View style={styles.card} testID="quote-price-preview">
      {row('quote.preview.customer', preview.customerPrice, true)}
      {row('quote.preview.fee', preview.commission)}
      {row('quote.preview.keep', value, true)}
      <Text style={[typography.caption, { color: colors.textMuted }]}>{t('quote.preview.note').en}</Text>
      <Text style={[urduTypography.bodySm, styles.ur]}>{t('quote.preview.note').ur}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  label: { flex: 1, paddingRight: spacing.sm },
  ur: { color: colors.textMuted, textAlign: 'right', writingDirection: 'rtl' },
  amount: { ...typography.bodySm, color: colors.textBody },
  strong: { ...typography.subtitle, color: colors.textStrong },
});
