import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { StringId } from '../../i18n/strings';
import { useT } from '../../i18n/useT';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography, urduTypography } from '../../theme/typography';
import { Icon } from '../ui/Icon';

/** The "Help me write" entry point on step 1 of a wizard. Opens the full-screen AI helper. */
export function AiHelpButton({ subId, onPress }: { subId: StringId; onPress: () => void }) {
  const { t } = useT();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('ai.helpMe').en}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
    >
      <View style={styles.icon}>
        <Icon name="zap" size={18} color={colors.primaryInk} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{t('ai.helpMe').en}</Text>
        <Text style={styles.sub}>{t(subId).en}</Text>
        <Text style={styles.subUr}>{t(subId).ur}</Text>
      </View>
      <Icon name="chevron-right" size={18} color={colors.primaryInk} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pressed: { opacity: 0.9 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  title: { ...typography.button, color: colors.primaryInk },
  sub: { ...typography.caption, color: '#D1FAE5' },
  subUr: { ...urduTypography.caption, color: '#D1FAE5', textAlign: 'right' },
});
