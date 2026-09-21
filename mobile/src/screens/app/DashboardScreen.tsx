import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { useAuth } from '../../context/AuthContext';
import type { StringId } from '../../i18n/strings';
import { SKILL_CATEGORIES } from '../../lib/skillCategories';
import { GuestJobsCard } from '../../components/GuestJobsCard';
import { fetchJobPostingEnabled } from '../../lib/jobPosting';
import { useUnreadNotifications } from '../../lib/useUnreadNotifications';
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
  const { count: unread } = useUnreadNotifications(session?.user.id);
  const isCustomerLike = (role ?? 'customer') === 'customer';
  const [postingEnabled, setPostingEnabled] = useState(false);
  useEffect(() => {
    fetchJobPostingEnabled().then(setPostingEnabled);
  }, []);
  const modeId: StringId = session?.user.id ? ((`role.${role ?? 'customer'}`) as StringId) : 'role.guest';

  return (
    <ScrollView
      contentContainerStyle={[
        styles.root,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <Card padding="lg" style={styles.brandCard}>
        {session ? (
          <Pressable
            onPress={() => navigation.navigate('Notifications')}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            hitSlop={10}
            style={styles.bell}
          >
            <Icon name="bell" size={22} color={colors.primaryDeep} />
            {unread > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{Math.min(unread, 99)}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Image
              source={require('../../../assets/logo-mark.png')}
              style={styles.brandMarkImage}
              resizeMode="contain"
            />
          </View>
          <View style={styles.brandTextCol}>
            <BiText id="common.appName" variant="displayLg" tone="strong" />
            <BiText id="dashboard.brand.tagline" variant="bodySm" tone="muted" style={styles.tagline} />
          </View>
        </View>
      </Card>

      <View style={[styles.ctaRow, !session && styles.ctaStack]}>
        {!session ? (
          <>
            <Button
              labelId="register.choice.professional"
              onPress={() => navigation.navigate('RegisterProfessional')}
              iconLeft="briefcase"
              size="lg"
              style={styles.ctaButton}
            />
            <Button
              labelId="register.choice.customer"
              onPress={() => navigation.navigate('RegisterCustomer')}
              variant="secondary"
              iconLeft="user"
              size="lg"
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

      {postingEnabled && (isCustomerLike || !session) ? (
        <Button
          labelId="post.cta"
          onPress={() => navigation.navigate('PostJob')}
          variant="secondary"
          iconLeft="plus-circle"
          fullWidth
          style={styles.postCta}
        />
      ) : null}
      {postingEnabled && session && role === 'worker' ? (
        <Button
          labelId="board.cta"
          onPress={() => navigation.navigate('JobBoard')}
          variant="secondary"
          iconLeft="briefcase"
          fullWidth
          style={styles.postCta}
        />
      ) : null}
      {postingEnabled ? <GuestJobsCard /> : null}

      <Card padding="lg">
        <View style={styles.categoriesHead}>
          <BiText id="dashboard.categories.title" variant="title" tone="strong" style={styles.categoriesTitle} />
          <Pressable
            onPress={() => navigation.navigate('Services')}
            accessibilityRole="link"
            accessibilityLabel="See all categories"
            hitSlop={8}
          >
            <BiText id="dashboard.categories.seeAll" hideUrdu variant="label" tone="body" enStyle={styles.seeAll} />
          </Pressable>
        </View>
        <View style={styles.categoryGrid}>
          {SKILL_CATEGORIES.map((c) => (
            <Pressable
              key={c.key}
              style={styles.categoryCard}
              accessibilityRole="button"
              onPress={() => navigation.navigate('Nearby', { category: c.key })}
            >
              <View style={styles.categoryIcon}>
                <Image source={c.icon} style={styles.categoryIconImage} resizeMode="contain" />
              </View>
              <BiText id={c.labelId} variant="label" tone="strong" align="center" style={styles.categoryLabel} />
            </Pressable>
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
  bell: { position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 2, padding: 4 },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  brandMark: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  brandMarkImage: { width: 44, height: 44 },
  brandTextCol: { flexShrink: 1 },
  tagline: { marginTop: 2 },
  ctaRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  ctaStack: { flexDirection: 'column' },
  ctaButton: { flex: 1 },
  postCta: { marginBottom: spacing.lg },
  categoriesHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  categoriesTitle: { flexShrink: 1 },
  seeAll: { color: colors.primary },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryCard: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  categoryIconImage: { width: 52, height: 52 },
  categoryLabel: { alignSelf: 'stretch' },
  trustLine: { marginTop: spacing.lg, paddingHorizontal: spacing.md },
  modeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, gap: 4 },
  modeText: { marginRight: 4 },
});
