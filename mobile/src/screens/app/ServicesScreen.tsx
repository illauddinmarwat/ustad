import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../../components/ui/Avatar';
import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { Icon } from '../../components/ui/Icon';
import { Input } from '../../components/ui/Input';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useAuth } from '../../context/AuthContext';
import type { StringId } from '../../i18n/strings';
import { trackEvent } from '../../lib/analytics';
import { ensureAuthenticated, ensureRole } from '../../lib/authGuards';
import { boostChipLabel } from '../../lib/boosts';
import { trackCampaignTouch } from '../../lib/campaignAttribution';
import { buildDiscoverySubtitle, resolveDiscoveryCityCode, shouldUseCityAwareDiscovery } from '../../lib/cityDiscovery';
import { assignCohort, RANKING_EXPERIMENT } from '../../lib/experiments';
import { fetchPhase3Flags } from '../../lib/featureFlags';
import { fetchPhase4Flags } from '../../lib/phase4Flags';
import { fetchPhase5Flags } from '../../lib/phase5Flags';
import { applyRanking, type RankableListing, type ScoredListing } from '../../lib/ranking';
import { trackRateLimitObservation } from '../../lib/scaleHardening';
import { supabase } from '../../lib/supabase';
import type { RootStackParamList, TabParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type Listing = {
  id: string;
  headline: string;
  price_pkr: number;
  status: string;
  worker_id: string;
  template_id: string;
  created_at?: string | null;
  is_boosted?: boolean | null;
  boost_weight?: number | null;
};

type RankedListingRow = Listing & {
  rating: number | null;
  review_count: number | null;
  response_rate: number | null;
  completion_rate: number | null;
  recency_days: number | null;
  score: number | null;
  is_verified: boolean | null;
  worker_display_name: string | null;
  is_boosted?: boolean | null;
  boost_weight?: number | null;
  boosted_score?: number | null;
  city_code?: string | null;
  city_filtered?: boolean | null;
};

type Template = { id: string; title: string; category: string };

type ServicesNav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Services'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type Msg = { kind: 'id'; id: StringId } | { kind: 'text'; text: string };

export default function ServicesScreen() {
  const navigation = useNavigation<ServicesNav>();
  const { role, session } = useAuth();
  const insets = useSafeAreaInsets();
  const [listings, setListings] = useState<Array<ScoredListing<Listing>>>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [headline, setHeadline] = useState('');
  const [price, setPrice] = useState('2500');
  const [rankingEnabled, setRankingEnabled] = useState(false);
  const [boostsEnabled, setBoostsEnabled] = useState(false);
  const [cityCode, setCityCode] = useState('karachi');
  const [cityAwareDiscovery, setCityAwareDiscovery] = useState(false);
  const [campaignsEnabled, setCampaignsEnabled] = useState(false);

  const userId = session?.user.id ?? null;

  const setMsgId = (id: StringId) => setMsg({ kind: 'id', id });
  const setMsgText = (text: string) => setMsg({ kind: 'text', text });

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from('service_templates')
      .select('id,title,category')
      .eq('active', true)
      .limit(20);
    if (error) throw new Error(error.message);
    setTemplates((data ?? []) as Template[]);
  };

  const loadFallback = async (): Promise<Array<RankableListing<Listing>>> => {
    const { data, error } = await supabase
      .from('worker_service_listings')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Listing[];
    return rows.map((row) => ({ ...row, signals: { rating: 0 } }));
  };

  const loadRanked = async (): Promise<Array<RankableListing<Listing>>> => {
    let res = await supabase.rpc('rank_listings_v2', { p_category: null, p_limit: 30 });
    if (res.error || !Array.isArray(res.data)) {
      res = await supabase.rpc('rank_listings', { p_category: null, p_limit: 30 });
    }
    if (res.error || !Array.isArray(res.data)) {
      return loadFallback();
    }
    return (res.data as RankedListingRow[]).map((row) => ({
      id: row.id,
      headline: row.headline,
      price_pkr: row.price_pkr,
      status: row.status,
      worker_id: row.worker_id,
      template_id: row.template_id,
      created_at: row.created_at,
      is_boosted: row.is_boosted ?? false,
      boost_weight: row.boost_weight ?? 0,
      signals: {
        rating: row.rating,
        reviewCount: row.review_count,
        responseRate: row.response_rate,
        completionRate: row.completion_rate,
        ageDays: row.recency_days,
        isVerified: row.is_verified ?? false,
      },
    }));
  };

  const loadRankedWithBoosts = async (): Promise<Array<RankableListing<Listing>>> => {
    const res = await supabase.rpc('rank_listings_with_boosts', { p_category: null, p_limit: 30 });
    if (res.error || !Array.isArray(res.data)) return loadRanked();
    return (res.data as RankedListingRow[]).map((row) => ({
      id: row.id,
      headline: row.headline,
      price_pkr: row.price_pkr,
      status: row.status,
      worker_id: row.worker_id,
      template_id: row.template_id,
      created_at: row.created_at,
      is_boosted: row.is_boosted ?? false,
      boost_weight: row.boost_weight ?? 0,
      signals: {
        rating: row.rating,
        reviewCount: row.review_count,
        responseRate: row.response_rate,
        completionRate: row.completion_rate,
        ageDays: row.recency_days,
        isVerified: row.is_verified ?? false,
      },
    }));
  };

  const loadPhase5Discovery = async (
    useBoosts: boolean,
    resolvedCityCode: string
  ): Promise<Array<RankableListing<Listing>>> => {
    const res = await supabase.rpc('phase5_discover_listings', {
      p_city_code: resolvedCityCode,
      p_category: null,
      p_limit: 30,
      p_include_boosts: useBoosts,
    });
    if (res.error || !Array.isArray(res.data)) {
      await trackRateLimitObservation({
        endpointKey: 'services_discovery',
        cityCode: resolvedCityCode,
        decision: 'fallback_allow',
        props: { path: 'phase5_discover_listings_fallback', reason: res.error?.message ?? 'unknown' },
      });
      return useBoosts ? loadRankedWithBoosts() : loadRanked();
    }
    return (res.data as RankedListingRow[]).map((row) => ({
      id: row.id,
      headline: row.headline,
      price_pkr: row.price_pkr,
      status: row.status,
      worker_id: row.worker_id,
      template_id: row.template_id,
      created_at: row.created_at,
      is_boosted: row.is_boosted ?? false,
      boost_weight: row.boost_weight ?? 0,
      signals: {
        rating: row.rating,
        reviewCount: row.review_count,
        responseRate: row.response_rate,
        completionRate: row.completion_rate,
        ageDays: row.recency_days,
        isVerified: row.is_verified ?? false,
      },
    }));
  };

  const loadEffectiveCityCode = async (): Promise<string> => {
    try {
      const res = await supabase.rpc('phase5_effective_city_code');
      if (res.error) return 'karachi';
      if (typeof res.data === 'string') return res.data.trim().toLowerCase() || 'karachi';
      if (Array.isArray(res.data) && typeof res.data[0] === 'string') {
        return (res.data[0] as string).trim().toLowerCase() || 'karachi';
      }
      return 'karachi';
    } catch {
      return 'karachi';
    }
  };

  const load = async () => {
    await loadTemplates();
    const [phase3, phase4, phase5] = await Promise.all([
      fetchPhase3Flags(),
      fetchPhase4Flags(),
      fetchPhase5Flags(),
    ]);
    setRankingEnabled(phase3.rankingEnabled);
    setBoostsEnabled(phase4.boostsEnabled);
    const cityAware = shouldUseCityAwareDiscovery(phase5);
    setCampaignsEnabled(phase5.cityCampaignsEnabled);
    const serverCityCode = cityAware ? await loadEffectiveCityCode() : 'karachi';
    const resolvedCityCode = resolveDiscoveryCityCode(phase5, null, serverCityCode);
    setCityAwareDiscovery(cityAware);
    setCityCode(resolvedCityCode);

    const rows = phase3.rankingEnabled
      ? cityAware
        ? await loadPhase5Discovery(phase4.boostsEnabled, resolvedCityCode)
        : phase4.boostsEnabled
          ? await loadRankedWithBoosts()
          : await loadRanked()
      : await loadFallback();
    setListings(applyRanking(rows, phase3.rankingEnabled));

    if (phase5.cityCampaignsEnabled) {
      await trackCampaignTouch({
        cityCode: resolvedCityCode,
        eventName: 'services_discovery_opened',
        props: {
          ranking_enabled: phase3.rankingEnabled,
          boosts_enabled: phase4.boostsEnabled,
          city_aware: cityAware,
        },
      });
    }
  };

  useEffect(() => {
    load().catch((e) => {
      const detail = e instanceof Error ? e.message : String(e);
      setMsgText(detail || 'Failed to load services');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cohort = useMemo(() => assignCohort(userId, RANKING_EXPERIMENT).label, [userId]);

  const impressionPayload = useMemo(
    () => ({
      ranking_enabled: rankingEnabled,
      boosts_enabled: boostsEnabled,
      campaigns_enabled: campaignsEnabled,
      count: listings.length,
      ids: listings.slice(0, 20).map((l) => l.id),
      top_score: listings[0]?.score ?? null,
      cohort,
    }),
    [listings, rankingEnabled, boostsEnabled, campaignsEnabled, cohort]
  );

  useEffect(() => {
    if (listings.length === 0) return;
    void trackEvent('ranking_impression', userId, impressionPayload);
    const topRows = listings.slice(0, 10);
    void Promise.all(
      topRows.map((l, idx) =>
        supabase.rpc('track_listing_promo_event', {
          p_listing_id: l.id,
          p_event_name: 'impression',
          p_position: idx,
          p_ranking_enabled: rankingEnabled,
          p_boosts_enabled: boostsEnabled,
          p_cohort: cohort,
          p_event_props: { score: l.score, is_boosted: l.is_boosted ?? false },
        })
      )
    ).catch(() => {
      // Non-blocking analytics path.
    });
  }, [impressionPayload, listings, userId, rankingEnabled, boostsEnabled, cohort]);

  const publishListing = async () => {
    const uid = session?.user.id;
    if (
      !ensureAuthenticated({
        userId: uid,
        message: 'Sign in to publish a listing.',
        setMessage: () => setMsgId('services.gate.publishSignIn'),
        goToAuth: () => navigation.navigate('Auth'),
      })
    ) {
      return;
    }
    if (
      !ensureRole({
        role,
        requiredRole: 'worker',
        roleMessage: 'Switch to worker role to publish services.',
        setMessage: () => setMsgId('services.gate.publishRole'),
      })
    ) {
      return;
    }
    if (!templates[0]) return;
    const amount = Number(price || '0');
    const { error } = await supabase.from('worker_service_listings').insert({
      worker_id: uid!,
      template_id: templates[0].id,
      headline: headline.trim() || `${templates[0].title} by me`,
      detail_text: 'Fast and reliable service',
      price_pkr: amount,
      status: 'active',
    });
    if (error) {
      setMsgText(error.message);
    } else {
      setMsgId('services.publish.toast');
      await trackEvent('listing_published', uid!, {
        template_id: templates[0].id,
        price_pkr: amount,
      });
      setHeadline('');
      await load();
    }
  };

  const openListing = (listing: ScoredListing<Listing>, position: number) => {
    void trackEvent('ranking_clicked', userId, {
      listing_id: listing.id,
      position,
      score: listing.score,
      ranking_enabled: rankingEnabled,
      boosts_enabled: boostsEnabled,
      cohort,
    });
    void (async () => {
      try {
        await supabase.rpc('track_listing_promo_event', {
          p_listing_id: listing.id,
          p_event_name: 'click',
          p_position: position,
          p_ranking_enabled: rankingEnabled,
          p_boosts_enabled: boostsEnabled,
          p_cohort: cohort,
          p_event_props: { score: listing.score, is_boosted: listing.is_boosted ?? false },
        });
      } catch {
        // Non-blocking analytics path.
      }
    })();
    navigation.navigate('ListingDetail', { listingId: listing.id });
  };

  const discoverySubtitle = buildDiscoverySubtitle(rankingEnabled, boostsEnabled, cityCode, cityAwareDiscovery);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.root,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <ScreenHeader titleId="services.title" subtitleId="services.subtitle" />

      {role === 'worker' && (
        <Card padding="lg">
          <BiText id="services.publish.title" variant="title" tone="strong" style={styles.cardTitle} />
          <Input
            labelId="services.publish.headline"
            value={headline}
            onChangeText={setHeadline}
            iconLeft="edit-3"
          />
          <Input
            labelId="services.publish.price"
            value={price}
            onChangeText={setPrice}
            keyboardType="numeric"
            iconLeft="dollar-sign"
          />
          <Button labelId="services.publish.cta" onPress={publishListing} iconLeft="upload" fullWidth />
        </Card>
      )}

      {msg ? (
        msg.kind === 'id' ? <Banner id={msg.id} tone="info" /> : <Banner text={msg.text} tone="warning" />
      ) : null}

      <Card padding="lg">
        <View style={styles.listingsHead}>
          <BiText id="services.list.title" variant="title" tone="strong" />
          <Pressable accessibilityRole="button" onPress={() => load().catch(() => setMsgId('services.error.load'))}>
            <Icon name="refresh-cw" size={16} color={colors.primary} />
          </Pressable>
        </View>
        <Text style={styles.discoverySubtitle}>{discoverySubtitle}</Text>

        {listings.length === 0 ? (
          <View style={styles.empty}>
            <BiText id="services.list.empty" variant="body" tone="muted" align="center" />
          </View>
        ) : (
          listings.map((l, idx) => (
            <Pressable key={l.id} style={styles.listingItem} onPress={() => openListing(l, idx)}>
              <Avatar name={l.headline} tone="primary" />
              <View style={styles.listingBody}>
                <Text style={styles.listingHeadline} numberOfLines={2}>{l.headline}</Text>
                <Text style={styles.listingPrice}>From Rs {l.price_pkr}</Text>
                {l.explanations.length > 0 || boostChipLabel({ is_boosted: l.is_boosted, boost_weight: l.boost_weight }) ? (
                  <View style={styles.chipRow}>
                    {boostChipLabel({ is_boosted: l.is_boosted, boost_weight: l.boost_weight }) ? (
                      <Chip label="Featured" tone="warning" icon="star" />
                    ) : null}
                    {l.explanations.map((label) => (
                      <Chip key={label} label={label} tone="primary" />
                    ))}
                  </View>
                ) : null}
              </View>
              <View style={styles.chevron}>
                <Icon name="chevron-right" size={20} color={colors.textMuted} />
              </View>
            </Pressable>
          ))
        )}

        {!session?.user.id && (
          <View style={styles.guestHint}>
            <Banner id="services.guest.inlineHint" tone="info" icon="user-plus" />
            <Button
              labelId="common.signInOrCreate"
              onPress={() => navigation.navigate('Auth')}
              variant="secondary"
              iconLeft="log-in"
              fullWidth
            />
          </View>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1 },
  cardTitle: { marginBottom: spacing.md },
  listingsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  discoverySubtitle: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md },
  empty: { paddingVertical: spacing.lg, alignItems: 'center' },
  listingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  listingBody: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  listingHeadline: { ...typography.subtitle, color: colors.textStrong },
  listingPrice: { ...typography.bodySm, color: colors.textMuted, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chevron: { padding: 4 },
  guestHint: { marginTop: spacing.md, gap: spacing.sm },
});
