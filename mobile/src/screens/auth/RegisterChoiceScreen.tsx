import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BiText } from '../../components/ui/BiText';
import { Icon, type IconProps } from '../../components/ui/Icon';
import type { StringId } from '../../i18n/strings';
import { useT } from '../../i18n/useT';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography, urduTypography } from '../../theme/typography';

export default function RegisterChoiceScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}>
      <BiText id="register.choice.title" variant="displayMd" tone="strong" style={styles.title} />
      <BiText id="register.choice.subtitle" variant="body" tone="muted" style={styles.subtitle} />

      <ChoiceCard
        icon="briefcase"
        titleId="register.choice.professional"
        subtitleId="register.choice.professionalSub"
        tone="primary"
        onPress={() => navigation.navigate('RegisterProfessional')}
      />
      <ChoiceCard
        icon="user"
        titleId="register.choice.customer"
        subtitleId="register.choice.customerSub"
        tone="outline"
        onPress={() => navigation.navigate('RegisterCustomer')}
      />
    </View>
  );
}

function ChoiceCard({
  icon,
  titleId,
  subtitleId,
  tone,
  onPress,
}: {
  icon: IconProps['name'];
  titleId: StringId;
  subtitleId: StringId;
  tone: 'primary' | 'outline';
  onPress: () => void;
}) {
  const { t } = useT();
  const title = t(titleId);
  const subtitle = t(subtitleId);
  const isPrimary = tone === 'primary';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        isPrimary ? styles.cardPrimary : styles.cardOutline,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.iconWrap, isPrimary ? styles.iconWrapPrimary : styles.iconWrapOutline]}>
        <Icon name={icon} size={22} color={isPrimary ? colors.primaryInk : colors.primary} />
      </View>
      <View style={styles.cardText}>
        <Text style={[typography.title, { color: isPrimary ? colors.primaryInk : colors.textStrong }]}>
          {title.en}
        </Text>
        <Text
          style={[
            urduTypography.body,
            styles.cardTitleUr,
            { color: isPrimary ? 'rgba(255,255,255,0.85)' : colors.textMuted },
          ]}
        >
          {title.ur}
        </Text>
        <Text
          style={[typography.bodySm, styles.cardSub, { color: isPrimary ? 'rgba(255,255,255,0.85)' : colors.textMuted }]}
        >
          {subtitle.en}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: spacing.lg, backgroundColor: colors.bg },
  title: { marginBottom: spacing.xs },
  subtitle: { marginBottom: spacing.xl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  cardPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  cardOutline: { backgroundColor: colors.surface, borderColor: colors.border },
  cardPressed: { opacity: 0.9 },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  iconWrapPrimary: { backgroundColor: 'rgba(255,255,255,0.18)' },
  iconWrapOutline: { backgroundColor: colors.primarySoft },
  cardText: { flex: 1 },
  cardTitleUr: { textAlign: 'right', writingDirection: 'rtl', marginTop: 1 },
  cardSub: { marginTop: spacing.xs },
});
