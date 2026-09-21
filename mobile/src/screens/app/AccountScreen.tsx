import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../../components/ui/Avatar';
import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon, type IconProps } from '../../components/ui/Icon';
import { CommissionCard } from '../../components/CommissionCard';
import { useLiveDatabase } from '../../config/env';
import { useAuth } from '../../context/AuthContext';
import type { StringId } from '../../i18n/strings';
import { useT } from '../../i18n/useT';
import { shouldShowCommunitySurface } from '../../lib/communityLite';
import { fetchPhase4Flags } from '../../lib/phase4Flags';
import { fetchPhase5Flags } from '../../lib/phase5Flags';
import { isLiveSubscription, subscriptionBadge, type PlanCode, type SubscriptionStatus } from '../../lib/subscriptions';
import { supabase } from '../../lib/supabase';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type Msg = { kind: 'id'; id: StringId } | { kind: 'text'; text: string } | null;

export default function AccountScreen() {
  const { session, role, setRole, signOut } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const [subsEnabled, setSubsEnabled] = useState(false);
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [subPlanCode, setSubPlanCode] = useState<PlanCode | null>(null);
  const [subEndsAt, setSubEndsAt] = useState<string | null>(null);
  const [subMsg, setSubMsg] = useState<Msg>(null);
  const [communityEnabled, setCommunityEnabled] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMsg, setLocationMsg] = useState<Msg>(null);

  const loadSubscription = async () => {
    const flags = await fetchPhase4Flags();
    setSubsEnabled(flags.subscriptionsEnabled);
    if (!flags.subscriptionsEnabled || !session?.user.id || !useLiveDatabase) {
      setSubStatus(null);
      setSubPlanCode(null);
      setSubEndsAt(null);
      return;
    }
    const { data, error } = await supabase.rpc('get_my_subscription_features');
    if (error || !data || !Array.isArray(data) || data.length === 0) {
      setSubStatus(null);
      setSubPlanCode(null);
      setSubEndsAt(null);
      return;
    }
    const top = data[0] as { status: SubscriptionStatus; plan_code: PlanCode; ends_at?: string | null };
    setSubStatus(top.status ?? null);
    setSubPlanCode(top.plan_code ?? null);
    setSubEndsAt(top.ends_at ?? null);
  };

  useEffect(() => {
    loadSubscription().catch(() => setSubMsg({ kind: 'text', text: 'Unable to load subscription state' }));
  }, [session?.user.id, role]);

  useEffect(() => {
    fetchPhase5Flags()
      .then((flags) => setCommunityEnabled(flags.cityCommunityEnabled))
      .catch(() => setCommunityEnabled(false));
  }, []);

  const subscribeSelf = async () => {
    if (!session?.user.id || !role) return;
    if (role === 'admin') {
      setSubMsg({ kind: 'id', id: 'account.membership.adminNoPlan' });
      return;
    }
    const code: PlanCode = role === 'worker' ? 'worker_pro' : 'customer_plus';
    const { error } = await supabase.rpc('subscribe_me_to_plan', { p_plan_code: code });
    if (error) setSubMsg({ kind: 'text', text: error.message });
    else {
      setSubMsg({
        kind: 'text',
        text: `${code === 'worker_pro' ? 'Worker Pro' : 'Customer Plus'} activated`,
      });
      await loadSubscription();
    }
  };

  const shareLocation = async () => {
    if (!session?.user.id) return;
    setLocationBusy(true);
    setLocationMsg(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationMsg({ kind: 'id', id: 'nearby.locate.denied' });
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { error } = await supabase
        .from('worker_profiles')
        .update({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          location_updated_at: new Date().toISOString(),
        })
        .eq('user_id', session.user.id);
      if (error) {
        setLocationMsg({ kind: 'text', text: error.message });
      } else {
        setLocationMsg({ kind: 'id', id: 'account.location.saved' });
      }
    } catch {
      setLocationMsg({ kind: 'id', id: 'account.location.failed' });
    } finally {
      setLocationBusy(false);
    }
  };

  const live = isLiveSubscription(subStatus, subEndsAt);
  const badge = subscriptionBadge(subPlanCode, live);
  const isGuest = !session?.user.id;
  const email = session?.user.email ?? null;
  const roleLabel = role ? t(`role.${role}` as StringId).en : t('role.guest').en;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.root,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <Card padding="lg">
        <View style={styles.profileRow}>
          <Avatar name={email ?? 'Guest'} size={56} tone="primary" />
          <View style={styles.profileBody}>
            <Text style={styles.profileName} numberOfLines={1}>{email ?? t('account.guest.title').en}</Text>
            <View style={styles.profileChips}>
              <Chip label={roleLabel} tone="primary" icon="user" />
              <Chip
                label={useLiveDatabase ? t('account.runtime.live').en : t('account.runtime.fixture').en}
                tone={useLiveDatabase ? 'accent' : 'neutral'}
                icon={useLiveDatabase ? 'database' : 'cpu'}
              />
            </View>
          </View>
        </View>
      </Card>

      {isGuest ? (
        <Card padding="lg">
          <EmptyState
            icon="user-plus"
            titleId="account.guest.title"
            subtitleId="account.guest.subtitle"
            ctaLabelId="common.signInOrCreate"
            onCta={() => navigation.navigate('Auth')}
          />
        </Card>
      ) : (
        <Card padding="lg">
          <BiText id="account.switchRole" variant="title" tone="strong" style={styles.cardTitle} />
          <View style={styles.btnRow}>
            <Button
              labelId="role.customer"
              onPress={() => setRole('customer')}
              variant={role === 'customer' ? 'primary' : 'secondary'}
              iconLeft="user"
              style={styles.flex1}
            />
            <Button
              labelId="role.worker"
              onPress={() => setRole('worker')}
              variant={role === 'worker' ? 'primary' : 'secondary'}
              iconLeft="briefcase"
              style={styles.flex1}
            />
          </View>
        </Card>
      )}

      {role === 'worker' && session?.user.id ? <CommissionCard /> : null}

      {role === 'worker' && (
        <Card padding="lg">
          <BiText id="account.verifyDocs" variant="title" tone="strong" style={styles.cardTitle} />
          <BiText id="account.verifyDocs.subtitle" variant="body" tone="muted" style={styles.cardSubtitle} />
          <Button
            labelId="account.verifyDocs.cta"
            onPress={() => navigation.navigate('WorkerOnboarding')}
            iconLeft="shield"
            variant="success"
            fullWidth
          />
        </Card>
      )}

      {role === 'worker' && (
        <Card padding="lg">
          <BiText id="account.location.title" variant="title" tone="strong" style={styles.cardTitle} />
          <BiText id="account.location.subtitle" variant="body" tone="muted" style={styles.cardSubtitle} />
          {locationMsg ? (
            locationMsg.kind === 'id' ? <Banner id={locationMsg.id} tone="info" /> : <Banner text={locationMsg.text} tone="warning" />
          ) : null}
          <Button
            labelId="account.location.cta"
            onPress={shareLocation}
            loading={locationBusy}
            iconLeft="map-pin"
            fullWidth
            style={styles.actionBtn}
          />
        </Card>
      )}

      {subsEnabled && role !== 'admin' && (
        <Card padding="lg">
          <BiText id="account.membership.title" variant="title" tone="strong" style={styles.cardTitle} />
          <BiText id="account.membership.subtitle" variant="bodySm" tone="muted" style={styles.cardSubtitle} />
          <View style={styles.statRow}>
            <BiText id="account.membership.plan" hideUrdu variant="caption" tone="muted" />
            <Text style={styles.statValue}>{badge ?? t('account.membership.freeTier').en}</Text>
          </View>
          <View style={styles.statRow}>
            <BiText id="account.membership.status" hideUrdu variant="caption" tone="muted" />
            <Text style={styles.statValue}>{subStatus ?? 'none'}</Text>
          </View>
          {subMsg ? (
            subMsg.kind === 'id' ? <Banner id={subMsg.id} tone="info" /> : <Banner text={subMsg.text} tone="info" />
          ) : null}
          <Button
            labelId={role === 'worker' ? 'account.membership.activateWorker' : 'account.membership.activateCustomer'}
            onPress={subscribeSelf}
            iconLeft="star"
            fullWidth
            style={styles.actionBtn}
          />
        </Card>
      )}

      <Card padding="lg">
        <BiText id="account.help.title" variant="title" tone="strong" style={styles.cardTitle} />
        <BiText id="account.help.subtitle" variant="bodySm" tone="muted" style={styles.cardSubtitle} />

        <SettingsRow icon="help-circle" titleId="account.help.openFaq" onPress={() => navigation.navigate('Faq')} />
        <SettingsRow icon="message-circle" titleId="account.help.openChat" onPress={() => navigation.navigate('FaqChat')} />
        {shouldShowCommunitySurface(communityEnabled) && (
          <SettingsRow icon="users" titleId="account.help.community" onPress={() => navigation.navigate('CommunityTips')} />
        )}
      </Card>

      {!isGuest && (
        <Button
          labelId="common.signOut"
          onPress={() => {
            signOut().catch((e) => {
              setSubMsg({ kind: 'text', text: e instanceof Error ? e.message : 'Sign out failed' });
            });
          }}
          variant="secondary"
          iconLeft="log-out"
          fullWidth
          style={styles.signOut}
        />
      )}
    </ScrollView>
  );
}

function SettingsRow({
  icon,
  titleId,
  onPress,
}: {
  icon: IconProps['name'];
  titleId: StringId;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.settingsRow}>
      <View style={styles.settingsIcon}>
        <Icon name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.settingsBody}>
        <BiText id={titleId} variant="subtitle" tone="strong" />
      </View>
      <Icon name="chevron-right" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1 },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  profileBody: { flex: 1, marginLeft: spacing.md },
  profileName: { ...typography.title, color: colors.textStrong },
  profileChips: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  cardTitle: { marginBottom: spacing.sm },
  cardSubtitle: { marginBottom: spacing.md },
  btnRow: { flexDirection: 'row', gap: spacing.sm },
  flex1: { flex: 1 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  statValue: { ...typography.subtitle, color: colors.textStrong },
  actionBtn: { marginTop: spacing.sm },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  settingsIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  settingsBody: { flex: 1 },
  signOut: { marginTop: spacing.lg },
});
