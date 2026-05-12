import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../../components/ui/Avatar';
import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useAuth } from '../../context/AuthContext';
import type { StringId } from '../../i18n/strings';
import { trackEvent } from '../../lib/analytics';
import { ensureAuthenticated, ensureRole } from '../../lib/authGuards';
import { supabase } from '../../lib/supabase';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type Listing = { id: string; headline: string };
type AppRow = {
  id: string;
  listing_id: string;
  customer_id: string;
  note: string | null;
  status: string;
  preferred_time: string | null;
};

type Msg = { kind: 'id'; id: StringId } | { kind: 'text'; text: string } | null;

const STATUS_TONE: Record<string, 'primary' | 'accent' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  pending: 'warning',
  accepted: 'accent',
  declined: 'danger',
};

export default function ApplicationsScreen() {
  const { session, role } = useAuth();
  const insets = useSafeAreaInsets();
  const [apps, setApps] = useState<AppRow[]>([]);
  const [listingMap, setListingMap] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Msg>(null);
  const isWorker = role === 'worker';

  const msgId = (id: StringId) => setMsg({ kind: 'id', id });
  const msgText = (text: string) => setMsg({ kind: 'text', text });

  const load = async () => {
    if (!session?.user.id) return;
    const { data: listings } = await supabase
      .from('worker_service_listings')
      .select('id,headline')
      .eq('worker_id', session.user.id);
    const lid = (listings ?? []).map((x) => x.id);
    const map: Record<string, string> = {};
    (listings as Listing[] | null)?.forEach((l) => {
      map[l.id] = l.headline;
    });
    setListingMap(map);
    if (lid.length === 0) {
      setApps([]);
      return;
    }
    const { data } = await supabase
      .from('listing_applications')
      .select('*')
      .in('listing_id', lid)
      .order('created_at', { ascending: false });
    setApps((data ?? []) as AppRow[]);
  };

  useEffect(() => {
    load().catch(() => msgId('applications.error.load'));
  }, [session?.user.id]);

  const accept = async (id: string) => {
    if (
      !ensureAuthenticated({
        userId: session?.user.id,
        message: 'Sign in to manage applications.',
        setMessage: () => msgId('applications.signInRequired'),
      })
    ) {
      return;
    }
    if (
      !ensureRole({
        role,
        requiredRole: 'worker',
        roleMessage: 'Only workers can accept applications.',
        setMessage: () => msgId('applications.roleRequired'),
      })
    ) {
      return;
    }
    const { error } = await supabase.rpc('worker_accept_listing_application', { application_id: id });
    if (error) msgText(error.message);
    else {
      msgId('applications.acceptToast');
      await trackEvent('application_accepted', session?.user.id ?? null, { application_id: id });
      await load();
    }
  };

  const decline = async (id: string) => {
    if (
      !ensureAuthenticated({
        userId: session?.user.id,
        message: 'Sign in to manage applications.',
        setMessage: () => msgId('applications.signInRequired'),
      })
    ) {
      return;
    }
    if (
      !ensureRole({
        role,
        requiredRole: 'worker',
        roleMessage: 'Only workers can decline applications.',
        setMessage: () => msgId('applications.roleRequired'),
      })
    ) {
      return;
    }
    const { error } = await supabase.rpc('worker_decline_listing_application', { application_id: id });
    if (error) msgText(error.message);
    else {
      msgId('applications.declineToast');
      await load();
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <ScreenHeader titleId="applications.title" subtitleId="applications.subtitle" />

      {!session?.user.id && (
        <Card padding="lg">
          <EmptyState icon="log-in" titleId="applications.signInRequired" subtitleId="applications.signInPrompt" />
        </Card>
      )}

      {session?.user.id && !isWorker && (
        <Card padding="lg">
          <EmptyState icon="lock" titleId="applications.roleRequired" subtitleId="applications.roleSwitch" />
        </Card>
      )}

      {msg ? (msg.kind === 'id' ? <Banner id={msg.id} tone="info" /> : <Banner text={msg.text} tone="warning" />) : null}

      {isWorker && (
        <Card padding="lg">
          {apps.length === 0 ? (
            <View style={styles.empty}>
              <BiText id="applications.empty" variant="body" tone="muted" align="center" />
            </View>
          ) : (
            apps.map((a) => (
              <View key={a.id} style={styles.row}>
                <Avatar name={listingMap[a.listing_id] ?? a.listing_id} tone="primary" />
                <View style={styles.body}>
                  <Text style={styles.title} numberOfLines={2}>
                    {listingMap[a.listing_id] ?? a.listing_id}
                  </Text>
                  <View style={styles.metaRow}>
                    <Chip label={a.status} tone={STATUS_TONE[a.status] ?? 'neutral'} />
                  </View>
                  {a.note ? <Text style={styles.note}>{a.note}</Text> : null}
                  {a.status === 'pending' && (
                    <View style={styles.actionsRow}>
                      <Button
                        labelId="applications.accept"
                        onPress={() => accept(a.id)}
                        variant="success"
                        iconLeft="check"
                        size="sm"
                        hideUrdu
                        style={styles.actionBtn}
                      />
                      <Button
                        labelId="applications.decline"
                        onPress={() => decline(a.id)}
                        variant="secondary"
                        iconLeft="x"
                        size="sm"
                        hideUrdu
                        style={styles.actionBtn}
                      />
                    </View>
                  )}
                </View>
              </View>
            ))
          )}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1 },
  empty: { paddingVertical: spacing.lg, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  body: { flex: 1, marginLeft: spacing.md },
  title: { ...typography.subtitle, color: colors.textStrong },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  note: { ...typography.bodySm, color: colors.textMuted, marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: { flex: 1 },
});
