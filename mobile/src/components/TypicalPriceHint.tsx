import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fetchQuoteUpgradesEnabled } from '../lib/quoteDetails';
import { fetchTypicalPrice, formatRange, type TypicalPrice } from '../lib/typicalPrice';
import { colors, radius, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { BiText } from './ui/BiText';

/** A guide to what similar jobs usually cost. Renders nothing while the feature is off or there is too little data. */
export function TypicalPriceHint({ category, city }: { category: string; city?: string | null }) {
  const [price, setPrice] = useState<TypicalPrice | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await fetchQuoteUpgradesEnabled())) return;
      const found = await fetchTypicalPrice(category, city);
      if (!cancelled) setPrice(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [category, city]);

  if (!price) return null;
  return (
    <View style={styles.card} testID="typical-price">
      <BiText id="typical.title" variant="label" tone="strong" />
      <Text style={styles.range}>{formatRange(price.low, price.high)}</Text>
      <Text style={styles.median}>Usually around Rs {price.median.toLocaleString('en-US')}</Text>
      <BiText id="typical.note" variant="caption" tone="muted" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 2,
  },
  range: { ...typography.title, color: colors.primaryDeep },
  median: { ...typography.bodySm, color: colors.textBody },
});
