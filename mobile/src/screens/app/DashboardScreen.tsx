import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { useAuth } from '../../context/AuthContext';
import type { StringId } from '../../i18n/strings';
import { SKILL_CATEGORIES } from '../../lib/skillCategories';
import type { RootStackParamList, TabParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type DashboardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

export default function DashboardScreen() {
  const navigation = useNavigation<DashboardNavigation>();
  const { role, session } = useAuth();
  const insets = useSafeAreaInsets();
  const isCustomerLike = (role ?? 'customer') === 'customer';
  const modeId: StringId = session?.user.id ? ((`role.${role ?? 'customer'}`) as StringId) : 'role.guest';

  return (
    <ScrollView
      contentContainerStyle={[
        styles.root,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <Card padding="lg" style={styles.brandCard}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Image
              source={require('../../../assets/logo-mark.png')}
              style={styles.brandMarkImage}
              resizeMode="contain"
            />
          </View>
          <View style={styles.brandTextCol}>
            <BiText id="common.appName" variant="displayMd" tone="strong" />
            <BiText id="dashboard.brand.tagline" variant="bodySm" tone="muted" style={styles.tagline} />
          </View>
        </View>
      </Card>

      <View style={styles.ctaRow}>
        {!session ? (
          <>
            <Button
              labelId="register.choice.professional"
              onPress={() => navigation.navigate('RegisterProfessional')}
              iconLeft="briefcase"
              hideUrdu
              style={styles.ctaButton}
            />
            <Button
              labelId="register.choice.customer"
              onPress={() => navigation.navigate('RegisterCustomer')}
              variant="secondary"
              iconLeft="user"
              hideUrdu
              style={styles.ctaButton}
            />
          </>
        ) : isCustomerLike ? (
          <>
            <Button
              labelId="dashboard.cta.browse"
              onPress={() => navigation.navigate('Services')}
              variant="secondary"
              iconLeft="search"
              style={styles.ctaButton}
            />
            <Button
              labelId="dashboard.cta.findNearby"
              onPress={() => navigation.navigate('Nearby')}
              iconLeft="map-pin"
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
              labelId="dashboard.cta.applications"
              onPress={() => navigation.navigate('Applications')}
              iconLeft="inbox"
              style={styles.ctaButton}
            />
          </>
        )}
      </View>

      <Card padding="lg">
        <View style={styles.categoriesHead}>
          <BiText id="dashboard.categories.title" variant="title" tone="strong" />
        </View>
        <View style={styles.categoryGrid}>
          {SKILL_CATEGORIES.map((c) => (
            <View key={c.key} style={styles.categoryCard}>
              <View style={styles.categoryIcon}>
                <Image source={c.icon} style={styles.categoryIconImage} resizeMode="contain" />
              </View>
              <BiText id={c.labelId} variant="label" tone="strong" align="center" style={styles.categoryLabel} />
            </View>
          ))}
        </View>
      </Card>

      <BiText id="dashboard.trust.line" variant="caption" tone="muted" align="center" style={styles.trustLine} />

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
  brandCard: { alignItems: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  brandMarkImage: { width: 32, height: 32 },
  brandTextCol: { flexShrink: 1 },
  tagline: { marginTop: 2 },
  ctaRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  ctaButton: { flex: 1 },
  categoriesHead: { marginBottom: spacing.md },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryCard: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  categoryIconImage: { width: 28, height: 28 },
  categoryLabel: { alignSelf: 'stretch' },
  trustLine: { marginTop: spacing.lg, paddingHorizontal: spacing.md },
  modeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, gap: 4 },
  modeText: { marginRight: 4 },
});
