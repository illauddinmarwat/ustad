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
import { notificationTarget, type NotificationRow } from '../../lib/notificationHelpers';
import { fetchNotifications, markNotificationsRead } from '../../lib/notifications';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Notifications'>;

export default function NotificationsScreen() {
  const navigation = useNavigation<Nav>();
  const { session } = useAuth();
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
    if (target.screen === 'JobDetail') navigation.navigate('JobDetail', target.params);
    else if (target.screen === 'Account') navigation.navigate('Tabs', { screen: 'Account' });
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

      {rows.map((n) => (
        <Pressable key={n.id} onPress={() => open(n)} accessibilityRole="button" style={styles.row}>
          <View style={[styles.dot, n.read_at ? styles.dotRead : styles.dotUnread]} />
          <View style={styles.body}>
            <Text style={[styles.title, !n.read_at && styles.titleUnread]}>{n.title}</Text>
            <Text style={styles.text}>{n.body}</Text>
            <Text style={styles.time}>{new Date(n.created_at).toLocaleString()}</Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.textMuted} />
        </Pressable>
      ))}

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
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotUnread: { backgroundColor: colors.primary },
  dotRead: { backgroundColor: 'transparent' },
  body: { flex: 1 },
  title: { ...typography.body, color: colors.textBody },
  titleUnread: { ...typography.subtitle, color: colors.textStrong },
  text: { ...typography.bodySm, color: colors.textMuted, marginTop: 2 },
  time: { ...typography.caption, color: colors.textMuted, marginTop: 4 },
});
