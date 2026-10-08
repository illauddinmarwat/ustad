import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useAuth } from '../../context/AuthContext';
import { groupNotifications, notificationTarget, timeAgo, type NotificationRow } from '../../lib/notificationHelpers';
import { useT } from '../../i18n/useT';
import { fetchNotifications, markNotificationsRead } from '../../lib/notifications';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Notifications'>;

export default function NotificationsScreen() {
  const navigation = useNavigation<Nav>();
  const { session, language } = useAuth();
  const { t } = useT();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    try {
      setRows(await fetchNotifications());
      setFailed(false);
    } catch {
      setFailed(true);
    }
    setLoaded(true);
  }, [session?.user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (n: NotificationRow) => {
    if (!n.read_at) {
      await markNotificationsRead([n.id]);
      setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r)));
    }
    const target = notificationTarget(n.kind, n.job_id);
    if (target.screen === 'JobDetail' || target.screen === 'JobChat' || target.screen === 'BoardJob') {
      navigation.navigate(target.screen, target.params);
    } else if (target.screen === 'Account') navigation.navigate('Tabs', { screen: 'Account' });
    else navigation.navigate('Tabs', { screen: 'Applications' });
  };

  const markAll = async () => {
    await markNotificationsRead();
    setRows((prev) => prev.map((r) => ({ ...r, read_at: r.read_at ?? new Date().toISOString() })));
  };

  const hasUnread = rows.some((r) => !r.read_at);

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingBottom: insets.bottom + spacing.xl }]}>
      <ScreenHeader titleId="notifications.title" />

      {!session?.user.id ? (
        <Card padding="lg">
          <EmptyState icon="log-in" titleId="request.signIn" />
        </Card>
      ) : null}

      {failed ? <Banner id="notifications.error" tone="warning" /> : null}

      {session?.user.id && loaded && rows.length === 0 && !failed ? (
        <Card padding="lg">
          <EmptyState icon="bell" titleId="notifications.empty" />
        </Card>
      ) : null}

      {hasUnread ? (
        <Button labelId="notifications.markAll" onPress={markAll} variant="secondary" iconLeft="check" size="sm" hideUrdu />
      ) : null}

      {groupNotifications(rows).map((g) => {
        const shown = expanded[g.key] ? [g.latest, ...g.earlier] : [g.latest];
        return (
          <View key={g.key} style={styles.group}>
            {shown.map((n) => (
              <Pressable key={n.id} onPress={() => open(n)} accessibilityRole="button" style={styles.row}>
                <View style={[styles.dot, n.read_at ? styles.dotRead : styles.dotUnread]} />
                <View style={styles.body}>
                  <Text style={[styles.title, !n.read_at && styles.titleUnread]}>{n.title}</Text>
                  <Text style={styles.text}>{n.body}</Text>
                  <Text style={styles.time}>{timeAgo(n.created_at, language === 'ur' ? 'ur' : 'en')}</Text>
                </View>
                <Icon name="chevron-right" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
            {g.earlier.length > 0 ? (
              <Pressable onPress={() => setExpanded((e) => ({ ...e, [g.key]: !e[g.key] }))} accessibilityRole="button" style={styles.more}>
                <Text style={styles.moreText}>
                  {expanded[g.key]
                    ? t('notifications.showLess')[language === 'ur' ? 'ur' : 'en']
                    : `+${g.earlier.length} ${t('notifications.earlier')[language === 'ur' ? 'ur' : 'en']}`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}

      {rows.length > 0 ? <BiText id="notifications.footer" variant="caption" tone="muted" align="center" /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1, gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  group: { gap: 4 },
  more: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: spacing.md },
  moreText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotUnread: { backgroundColor: colors.primary },
  dotRead: { backgroundColor: 'transparent' },
  body: { flex: 1 },
  title: { ...typography.body, color: colors.textBody },
  titleUnread: { ...typography.subtitle, color: colors.textStrong },
  text: { ...typography.bodySm, color: colors.textMuted, marginTop: 2 },
  time: { ...typography.caption, color: colors.textMuted, marginTop: 4 },
});
