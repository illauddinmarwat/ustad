import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BiText } from '../../components/ui/BiText';
import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { useAuth } from '../../context/AuthContext';
import type { StringId } from '../../i18n/strings';
import { fetchJobPostingEnabled } from '../../lib/jobPosting';
import { useWorkerAvailability, useWorkerEarnings } from '../../lib/workerStats';
import { useUnreadNotifications } from '../../lib/useUnreadNotifications';
import type { RootStackParamList, TabParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';

type Nav = CompositeNavigationProp<BottomTabNavigationProp<TabParamList>, NativeStackNavigationProp<RootStackParamList>>;

const KPI_IDS: StringId[] = ['home.worker.kpi.jobs', 'home.worker.kpi.rating', 'home.worker.kpi.response'];

/** Ustad home: work-led — availability, KPIs, new jobs and the inbox. Numbers are placeholders for now. */
export default function WorkerHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const { count: unread } = useUnreadNotifications(session?.user.id);
  const { available, toggle } = useWorkerAvailability(session?.user.id);
  const { summary } = useWorkerEarnings(session?.user.id);
  const kpis = [String(summary.weekJobs), '—', '—']; // rating / response rate: not tracked yet
  const [postingEnabled, setPostingEnabled] = useState(false);
  useEffect(() => {
    fetchJobPostingEnabled().then(setPostingEnabled);
  }, []);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.root, { paddingBottom: insets.bottom + spacing.xl }]}
    >
      <View style={[styles.band, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.row}>
          <BiText id="home.worker.greeting" variant="displayLg" hideUrdu enStyle={styles.inverse} style={styles.flex} />
          <Pressable
            onPress={() => navigation.navigate('Notifications')}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            hitSlop={10}
          >
            <Icon name="bell" size={22} color="#fff" />
            {unread > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{Math.min(unread, 99)}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
        <View style={styles.availability}>
          <View style={[styles.dot, { backgroundColor: available ? colors.accent : colors.textMuted }]} />
          <BiText
            id={available ? 'home.worker.available' : 'home.worker.unavailable'}
            hideUrdu
            variant="label"
            tone="strong"
            style={styles.flex}
          />
          <Switch
            value={available}
            onValueChange={toggle}
            trackColor={{ true: colors.accent, false: colors.border }}
            accessibilityLabel="Availability"
          />
        </View>
        <View style={styles.kpiRow}>
          {KPI_IDS.map((id, i) => (
            <View key={id} style={styles.kpi}>
              <Text style={styles.kpiValue}>{kpis[i]}</Text>
              <BiText id={id} hideUrdu variant="caption" enStyle={styles.kpiLabel} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.body}>
        {postingEnabled ? (
          <Pressable onPress={() => navigation.navigate('JobBoard')} accessibilityRole="button">
            <Card padding="lg" style={[styles.item, styles.gap]}>
              <View style={styles.iconWrap}>
                <Icon name="briefcase" size={22} color={colors.primary} />
              </View>
              <View style={styles.flex}>
                <BiText id="home.worker.newJobs" variant="title" tone="strong" />
                <BiText id="home.worker.newJobsSub" variant="bodySm" tone="muted" />
              </View>
              <Icon name="chevron-right" size={20} color={colors.textMuted} />
            </Card>
          </Pressable>
        ) : null}

        <Pressable onPress={() => navigation.navigate('Applications')} accessibilityRole="button">
          <Card padding="lg" style={[styles.item, styles.gap]}>
            <View style={styles.iconWrap}>
              <Icon name="inbox" size={22} color={colors.primary} />
            </View>
            <BiText id="home.worker.inbox" variant="title" tone="strong" style={styles.flex} />
            {unread > 0 ? (
              <View style={styles.pill}>
                <Text style={styles.pillText}>{unread}</Text>
              </View>
            ) : null}
            <Icon name="chevron-right" size={20} color={colors.textMuted} />
          </Card>
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Services')} accessibilityRole="button">
          <Card padding="lg" style={styles.item}>
            <View style={styles.iconWrap}>
              <Icon name="grid" size={22} color={colors.primary} />
            </View>
            <BiText id="dashboard.cta.myListings" variant="title" tone="strong" style={styles.flex} />
            <Icon name="chevron-right" size={20} color={colors.textMuted} />
          </Card>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: colors.bg },
  root: { flexGrow: 1 },
  flex: { flex: 1 },
  inverse: { color: '#fff' },
  band: {
    backgroundColor: colors.primaryDeep,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  availability: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  kpiRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  kpi: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  kpiValue: { color: '#fff', fontSize: 22, fontWeight: '700' },
  kpiLabel: { color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 2 },
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
  gap: { marginBottom: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
