import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { StringId } from '../i18n/strings';
import { useT } from '../i18n/useT';
import { colors, radius, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { BiText } from './ui/BiText';

/** The values stored for the preferred time: plain English words the Ustad can read. */
const OPTIONS: Array<{ value: string; id: StringId }> = [
  { value: 'Today', id: 'time.today' },
  { value: 'Tomorrow', id: 'time.tomorrow' },
  { value: 'This week', id: 'time.week' },
  { value: 'Any time', id: 'time.any' },
];

type Props = { value: string; onChange: (v: string) => void };

/** Quick choices for "when": one tap instead of typing. Tapping the chosen one again clears it. */
export function TimeChips({ value, onChange }: Props) {
  const { t } = useT();
  return (
    <View style={styles.wrap}>
      <BiText id="time.when" variant="label" tone="body" style={styles.label} />
      <View style={styles.row}>
        {OPTIONS.map((o) => {
          const on = value.trim().toLowerCase() === o.value.toLowerCase();
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(on ? '' : o.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[typography.label, on ? styles.textOn : styles.text]}>{t(o.id).en}</Text>
              <Text style={[styles.ur, on ? styles.textOn : styles.text]}>{t(o.id).ur}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { color: colors.textBody },
  textOn: { color: colors.primaryInk },
  ur: { fontSize: 11, lineHeight: 16 },
});
