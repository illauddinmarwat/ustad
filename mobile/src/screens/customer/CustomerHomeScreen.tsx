import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GuestJobsCard } from '../../components/GuestJobsCard';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { useAuth } from '../../context/AuthContext';
import { fetchJobPostingEnabled } from '../../lib/jobPosting';
import { useSkillCategories } from '../../lib/skillCategories';
import { useUnreadNotifications } from '../../lib/useUnreadNotifications';
import type { RootStackParamList, TabParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography, urduTypography } from '../../theme/typography';

type Nav = CompositeNavigationProp<BottomTabNavigationProp<TabParamList>, NativeStackNavigationProp<RootStackParamList>>;

/** Customer home: discovery-led — search, categories, nearby Ustads, post a job. */
export default function CustomerHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const categories = useSkillCategories();
  const { count: unread } = useUnreadNotifications(session?.user.id);
  const [postingEnabled, setPostingEnabled] = useState(false);
  useEffect(() => {
    fetchJobPostingEnabled().then(setPostingEnabled);
  }, []);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.root, { paddingBottom: insets.bottom + spacing.xl }]}
    >
      <View style={[styles.hero, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.heroTop}>
          <Image source={require('../../../assets/logo-mark.png')} style={styles.logo} resizeMode="contain" />
          <BiText id="common.appName" variant="title" tone="strong" style={styles.flex} />
          {session ? (
            <Pressable
              onPress={() => navigation.navigate('Notifications')}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              hitSlop={10}
            >
              <Icon name="bell" size={22} color={colors.primaryDeep} />
              {unread > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{Math.min(unread, 99)}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
        </View>
        <BiText id="home.customer.greeting" variant="displayLg" tone="strong" style={styles.greeting} />
        <Pressable onPress={() => navigation.navigate('Services')} accessibilityRole="search" style={styles.search}>
          <Icon name="search" size={18} color={colors.textMuted} />
          <BiText id="home.customer.search" hideUrdu variant="bodySm" tone="muted" style={styles.flex} />
        </Pressable>
      </View>

      <View style={styles.body}>
        {!session ? (
          <View style={styles.guestRow}>
            <Button
              labelId="register.choice.customer"
              onPress={() => navigation.navigate('RegisterCustomer')}
              iconLeft="user"
              style={styles.flex}
            />
            <Button
              labelId="register.choice.professional"
              onPress={() => navigation.navigate('RegisterProfessional')}
              variant="secondary"
              iconLeft="briefcase"
              style={styles.flex}
            />
          </View>
        ) : null}

        {postingEnabled ? (
          <Button
            labelId="post.cta"
            onPress={() => navigation.navigate('PostJob')}
            iconLeft="plus-circle"
            size="lg"
            fullWidth
            style={styles.gap}
          />
        ) : null}
        {postingEnabled ? <GuestJobsCard /> : null}

        <Card padding="lg" style={styles.gap}>
          <View style={styles.head}>
            <BiText id="dashboard.categories.title" variant="title" tone="strong" style={styles.flex} />
            <Pressable onPress={() => navigation.navigate('Services')} accessibilityRole="link" hitSlop={8}>
              <BiText id="dashboard.categories.seeAll" hideUrdu variant="label" tone="body" enStyle={styles.link} />
            </Pressable>
          </View>
          <View style={styles.grid}>
            {categories.slice(0, 6).map((c) => (
              <Pressable
                key={c.key}
                style={styles.cat}
                accessibilityRole="button"
                onPress={() => navigation.navigate('Nearby', { category: c.key })}
              >
                <Image source={c.icon} style={styles.catIcon} resizeMode="contain" />
                <Text style={[typography.label, styles.catEn]}>{c.en}</Text>
                {c.ur ? <Text style={[urduTypography.caption, styles.catUr]}>{c.ur}</Text> : null}
              </Pressable>
            ))}
          </View>
        </Card>

        <Pressable onPress={() => navigation.navigate('Nearby')} accessibilityRole="button">
          <Card padding="lg" style={styles.nearby}>
            <View style={styles.nearbyIcon}>
              <Icon name="map-pin" size={22} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <BiText id="home.customer.nearbyTitle" variant="title" tone="strong" />
              <BiText id="home.customer.nearbySub" hideUrdu variant="bodySm" tone="muted" />
            </View>
            <Icon name="chevron-right" size={20} color={colors.textMuted} />
          </Card>
        </Pressable>

        <BiText id="dashboard.trust.line" variant="caption" tone="muted" align="center" style={styles.trust} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: colors.bg },
  root: { flexGrow: 1 },
  flex: { flex: 1 },
  hero: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logo: { width: 32, height: 32 },
  greeting: { marginTop: spacing.md, marginBottom: spacing.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  body: { padding: spacing.lg },
  guestRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  gap: { marginBottom: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  link: { color: colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cat: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catIcon: { width: 48, height: 48, marginBottom: spacing.sm },
  catEn: { color: colors.textStrong, textAlign: 'center' },
  catUr: { color: colors.textMuted, textAlign: 'center', marginTop: 2 },
  nearby: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nearbyIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trust: { marginTop: spacing.lg },
});
