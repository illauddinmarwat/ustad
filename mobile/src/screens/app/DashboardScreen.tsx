import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Icon, type IconProps } from '../../components/ui/Icon';
import { useAuth } from '../../context/AuthContext';
import type { StringId } from '../../i18n/strings';
import { useT } from '../../i18n/useT';
import type { TabParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography, urduTypography } from '../../theme/typography';

type Category = { labelId: StringId; icon: IconProps['name'] };
type Step = { num: string; textId: StringId; icon: IconProps['name'] };

const CATEGORIES: Category[] = [
  { labelId: 'dashboard.categories.plumbing', icon: 'droplet' },
  { labelId: 'dashboard.categories.electrical', icon: 'zap' },
  { labelId: 'dashboard.categories.cleaning', icon: 'wind' },
  { labelId: 'dashboard.categories.ac', icon: 'thermometer' },
  { labelId: 'dashboard.categories.handyman', icon: 'tool' },
];

const STEPS: Step[] = [
  { num: '01', textId: 'dashboard.howItWorks.step1', icon: 'edit-3' },
  { num: '02', textId: 'dashboard.howItWorks.step2', icon: 'message-square' },
  { num: '03', textId: 'dashboard.howItWorks.step3', icon: 'check-circle' },
];

export default function DashboardScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<TabParamList>>();
  const { role, session } = useAuth();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const isCustomerLike = (role ?? 'customer') === 'customer';
  const modeId: StringId = session?.user.id
    ? ((`role.${role ?? 'customer'}`) as StringId)
    : 'role.guest';

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <LinearGradient
        colors={[colors.primary, colors.primaryDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <BiText id="dashboard.hero.title" variant="displayLg" tone="inverse" />
        <BiText id="dashboard.hero.subtitle" variant="body" tone="inverse" style={styles.heroSub} />

        <View style={styles.ctaRow}>
          {isCustomerLike ? (
            <>
              <Button
                labelId="dashboard.cta.browse"
                onPress={() => navigation.navigate('Services')}
                variant="secondary"
                iconLeft="search"
                style={styles.ctaButton}
              />
              <Button
                labelId="dashboard.cta.postJob"
                onPress={() => navigation.navigate('Jobs')}
                iconLeft="plus"
                style={styles.ctaButton}
              />
            </>
          ) : (
            <>
              <Button
                labelId="dashboard.cta.myListings"
                onPress={() => navigation.navigate('Services')}
                variant="secondary"
                iconLeft="grid"
                style={styles.ctaButton}
              />
              <Button
                labelId="dashboard.cta.openJobs"
                onPress={() => navigation.navigate('Jobs')}
                iconLeft="briefcase"
                style={styles.ctaButton}
              />
            </>
          )}
        </View>
      </LinearGradient>

      <Card>
        <BiText id="dashboard.howItWorks.title" variant="title" tone="strong" style={styles.cardTitle} />
        {STEPS.map((s) => (
          <View key={s.num} style={styles.stepRow}>
            <View style={styles.stepIcon}>
              <Icon name={s.icon} size={18} color={colors.primary} />
            </View>
            <View style={styles.stepBody}>
              <Text style={styles.stepNo}>{s.num}</Text>
              <BiText id={s.textId} variant="subtitle" tone="strong" />
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <BiText id="dashboard.categories.title" variant="title" tone="strong" style={styles.cardTitle} />
        <View style={styles.chipGrid}>
          {CATEGORIES.map((c) => {
            const entry = t(c.labelId);
            return (
              <View key={c.labelId} style={styles.categoryChip}>
                <Icon name={c.icon} size={14} color={colors.primaryDeep} />
                <View style={styles.categoryChipText}>
                  <Text style={styles.categoryEn}>{entry.en}</Text>
                  <Text style={styles.categoryUr}>{entry.ur}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      <View style={styles.modeRow}>
        <Icon name="info" size={14} color={colors.textMuted} />
        <BiText id="dashboard.mode.label" hideUrdu variant="caption" tone="muted" style={styles.modeText} />
        <BiText id={modeId} hideUrdu variant="caption" tone="strong" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1 },
  hero: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  heroSub: { marginTop: spacing.sm, marginBottom: spacing.lg },
  ctaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ctaButton: { flexGrow: 1, flexBasis: '45%' },
  cardTitle: { marginBottom: spacing.md },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  stepBody: { flex: 1 },
  stepNo: { ...typography.overline, color: colors.primary, marginBottom: 2 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  categoryChipText: { marginLeft: 6 },
  categoryEn: { ...typography.label, color: colors.primaryDeep },
  categoryUr: { ...urduTypography.caption, color: colors.primaryDeep, textAlign: 'right', writingDirection: 'rtl' },
  modeRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: 4 },
  modeText: { marginRight: 4 },
});
