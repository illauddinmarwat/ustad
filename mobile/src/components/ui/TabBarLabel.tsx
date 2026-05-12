import { StyleSheet, Text, View } from 'react-native';

import type { StringId } from '../../i18n/strings';
import { useT } from '../../i18n/useT';
import { colors } from '../../theme/tokens';
import { fontFamilies } from '../../theme/typography';

export type TabBarLabelProps = {
  id: StringId;
  focused: boolean;
};

/** Tightly-spaced bilingual tab label rendered under the icon. */
export function TabBarLabel({ id, focused }: TabBarLabelProps) {
  const { t } = useT();
  const entry = t(id);
  const color = focused ? colors.primary : colors.textMuted;
  return (
    <View style={styles.wrap}>
      <Text style={[styles.en, { color }]} numberOfLines={1}>
        {entry.en}
      </Text>
      <Text style={[styles.ur, { color }]} numberOfLines={1}>
        {entry.ur}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginTop: 1 },
  en: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 10,
    lineHeight: 12,
  },
  ur: {
    fontFamily: fontFamilies.urdu,
    fontSize: 9,
    lineHeight: 12,
    marginTop: 1,
    writingDirection: 'rtl',
  },
});
