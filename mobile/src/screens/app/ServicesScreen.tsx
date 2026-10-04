import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocalizedText } from '../../components/LocalizedText';
import { ServiceCard } from '../../components/ServiceCard';
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
import { useT } from '../../i18n/useT';
import { trackEvent } from '../../lib/analytics';
import { boostChipLabel } from '../../lib/boosts';
import { trackCampaignTouch } from '../../lib/campaignAttribution';
import { buildDiscoverySubtitle, resolveDiscoveryCityCode, shouldUseCityAwareDiscovery } from '../../lib/cityDiscovery';
import { assignCohort, RANKING_EXPERIMENT } from '../../lib/experiments';
import { templateCategoryFor } from '../../lib/categoryMap';
import { fetchPhase3Flags } from '../../lib/featureFlags';
import {
  loadListingCards,
  loadListingExtras,
  loadListingPhotos,
  loadMyListings,
  type ListingCardInfo,
  type ListingExtras,
  type MyListing,
} from '../../lib/listings';
import { fetchPhase4Flags } from '../../lib/phase4Flags';
import { fetchPhase5Flags } from '../../lib/phase5Flags';
import { applyRanking, type RankableListing, type ScoredListing } from '../../lib/ranking';
import { useSkillCategories } from '../../lib/skillCategories';
import { trackRateLimitObservation } from '../../lib/scaleHardening';
import { supabase } from '../../lib/supabase';
import type { RootStackParamList, TabParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type Listing = {
  id: string;
  headline: string;
  price_pkr?: number | null;
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

type ServicesNav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Services'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type Msg = { kind: 'id'; id: StringId } | { kind: 'text'; text: string };

export default function ServicesScreen() {
  const navigation = useNavigation<ServicesNav>();
  const route = useRoute<RouteProp<TabParamList, 'Services'>>();
  const { t } = useT();
  const categories = useSkillCategories();
  const { role, session, workerApprovalStatus, setRole } = useAuth();
  const insets = useSafeAreaInsets();
  const [listings, setListings] = useState<Array<ScoredListing<Listing>>>([]);
  const [photos, setPhotos] = useState<Record<string, string[]>>({});
  const [extras, setExtras] = useState<Record<string, ListingExtras>>({});
  const [mine, setMine] = useState<MyListing[]>([]);
  const [cards, setCards] = useState<Record<string, ListingCardInfo>>({});
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'mine' | 'others'>('mine');
  const { width } = useWindowDimensions();
  const [msg, setMsg] = useState<Msg | null>(null);
  const [rankingEnabled, setRankingEnabled] = useState(false);
  const [boostsEnabled, setBoostsEnabled] = useState(false);
  const [cityCode, setCityCode] = useState('karachi');
  const [cityAwareDiscovery, setCityAwareDiscovery] = useState(false);
  const [campaignsEnabled, setCampaignsEnabled] = useState(false);
  const [category, setCategory] = useState<string | null>(route.params?.category ?? null);
  const templateCategory = templateCategoryFor(category);

  useEffect(() => {
    setCategory(route.params?.category ?? null);
  }, [route.params?.category]);

  const userId = session?.user.id ?? null;

  const setMsgId = (id: StringId) => setMsg({ kind: 'id', id });
  const setMsgText = (text: string) => setMsg({ kind: 'text', text });

  const loadFallback = async (): Promise<Array<RankableListing<Listing>>> => {
    let query = supabase.from('worker_service_listings').select('*').eq('status', 'active');
    if (templateCategory) {
      const { data: tpl } = await supabase
        .from('service_templates')
        .select('id')
        .eq('active', true)
        .eq('category', templateCategory);
      const ids = ((tpl ?? []) as Array<{ id: string }>).map((t) => t.id);
      if (ids.length === 0) return [];
      query = query.in('template_id', ids);
    }
    const { data, error } = await query.order('created_at', { ascending: false }).limit(30);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Listing[];
    return rows.map((row) => ({ ...row, signals: { rating: 0 } }));
  };

  const loadRanked = async (): Promise<Array<RankableListing<Listing>>> => {
    let res = await supabase.rpc('rank_listings_v2', { p_category: templateCategory, p_limit: 30 });
    if (res.error || !Array.isArray(res.data)) {
      res = await supabase.rpc('rank_listings', { p_category: templateCategory, p_limit: 30 });
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
    const res = await supabase.rpc('rank_listings_with_boosts', { p_category: templateCategory, p_limit: 30 });
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
      p_category: templateCategory,
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
    let myList: MyListing[] = [];
    if (userId && role === 'worker') {
      myList = await loadMyListings(userId);
      setMine(myList);
    }
    const ranked = applyRanking(rows, phase3.rankingEnabled);
    setListings(ranked);
    const ids = Array.from(new Set([...ranked.map((l) => l.id), ...myList.map((m) => m.id)]));
    void Promise.all([loadListingPhotos(ids), loadListingExtras(ids), loadListingCards(ids)]).then(([p, x, c]) => {
      setPhotos(p);
      setExtras(x);
      setCards(c);
    });

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
  }, [category]);

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

  const wide = width >= 720;
  const isWorker = role === 'worker';
  const showMine = isWorker && tab === 'mine';
  const showOthers = !isWorker || tab === 'others';
  const needle = search.trim().toLowerCase();
  const shown = listings
    .map((l, idx) => ({ l, idx }))
    .filter(({ l }) => l.worker_id !== userId)
    .filter(({ l }) => {
      if (!needle) return true;
      const hay = [l.headline, extras[l.id]?.headlineI18n?.en, extras[l.id]?.headlineI18n?.ur, cards[l.id]?.workerName, ...(extras[l.id]?.areas ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });

  const discoverySubtitle = buildDiscoverySubtitle(rankingEnabled, boostsEnabled, cityCode, cityAwareDiscovery);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.root,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      {isWorker ? (
        <ScreenHeader titleId="services.worker.title" subtitleId="services.worker.subtitle" />
      ) : (
        <ScreenHeader titleId="services.title" subtitleId="services.subtitle" />
      )}

      {isWorker ? (
        <View style={styles.tabs} accessibilityRole="tablist">
          {(['mine', 'others'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => setTab(k)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === k }}
              style={[styles.tab, tab === k && styles.tabOn]}
            >
              <Text style={[typography.label, tab === k ? styles.tabTextOn : styles.tabText]}>{t(`services.tab.${k}` as StringId).en}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {showOthers ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          <CategoryPill label="All" active={category === null} onPress={() => setCategory(null)} />
          {categories.map((c) => (
            <CategoryPill key={c.key} label={c.en} active={category === c.key} onPress={() => setCategory(c.key)} />
          ))}
        </ScrollView>
      ) : null}

      {showMine && mine.length > 0 && workerApprovalStatus === 'approved' ? (
        <Button
          labelId="listing.addService"
          onPress={() => navigation.navigate('ListingWizard')}
          iconLeft="plus"
          variant="secondary"
          fullWidth
        />
      ) : null}

      {showMine && (
        <>
          {mine.length > 0 && workerApprovalStatus === 'approved' ? null : (
          <Card padding="lg">
            <BiText id="services.publish.title" variant="title" tone="strong" style={styles.cardTitle} />
            {workerApprovalStatus !== 'approved' && (
              <Banner
                id={workerApprovalStatus === 'pending' || workerApprovalStatus === null ? 'services.approval.pendingBanner' : undefined}
                text={workerApprovalStatus === 'rejected' ? 'Your registration was rejected. Contact support to appeal.' : undefined}
                tone={workerApprovalStatus === 'rejected' ? 'danger' : 'warning'}
              />
            )}
            <BiText id="listing.noPrice" variant="bodySm" tone="muted" style={styles.cardTitle} />
            <Button
              labelId="listing.addService"
              onPress={() => navigation.navigate('ListingWizard')}
              iconLeft="plus"
              fullWidth
              disabled={workerApprovalStatus !== 'approved'}
            />
          </Card>
          )}

          {mine.length === 0 ? (
            <Card padding="lg">
              <BiText id="services.mine.empty" variant="body" tone="muted" align="center" />
            </Card>
          ) : (
            <View style={styles.grid}>
              {mine.map((m) => (
                <View key={m.id} style={wide ? styles.cellWide : styles.cell}>
                  <ServiceCard
                    headline={m.headline}
                    headlineI18n={extras[m.id]?.headlineI18n}
                    workerName={cards[m.id]?.workerName}
                    rating={cards[m.id]?.rating}
                    reviewCount={cards[m.id]?.reviewCount}
                    verified={cards[m.id]?.verified}
                    jobsDone={cards[m.id]?.jobsDone}
                    areas={extras[m.id]?.areas}
                    photos={photos[m.id]}
                    status={m.status === 'active' || m.status === 'paused' ? m.status : 'draft'}
                    onEdit={() => navigation.navigate('ListingWizard', { listingId: m.id })}
                    onPress={() => navigation.navigate('ListingWizard', { listingId: m.id })}
                  />
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {msg ? (
        msg.kind === 'id' ? <Banner id={msg.id} tone="info" /> : <Banner text={msg.text} tone="warning" />
      ) : null}

      {showOthers ? (
        <>
      {isWorker ? (
        <View style={styles.switchBox}>
          <Banner id="services.worker.switchHint" tone="info" icon="repeat" />
          <Button labelId="services.switchToCustomer" onPress={() => void setRole('customer')} variant="secondary" iconLeft="user" fullWidth />
        </View>
      ) : null}
      <View style={styles.listingsHead}>
        <BiText id="services.list.title" variant="title" tone="strong" />
        <Pressable accessibilityRole="button" onPress={() => load().catch(() => setMsgId('services.error.load'))}>
          <Icon name="refresh-cw" size={16} color={colors.primary} />
        </Pressable>
      </View>
      <Input
        value={search}
        onChangeText={setSearch}
        placeholderId="services.search"
        iconLeft="search"
        containerStyle={styles.searchBox}
        hideUrduHint
      />
      <Text style={styles.discoverySubtitle}>
        {shown.length} {t('services.count').en} · {discoverySubtitle}
      </Text>

      {listings.length === 0 ? (
        <Card padding="lg">
          <View style={styles.empty}>
            <BiText id="services.list.empty" variant="body" tone="muted" align="center" />
            <Button
              labelId="services.findNearby"
              onPress={() => navigation.navigate('Nearby', category ? { category } : undefined)}
              variant="secondary"
              iconLeft="map-pin"
              fullWidth
              style={styles.emptyCta}
            />
          </View>
        </Card>
      ) : shown.length === 0 ? (
        <Card padding="lg">
          <BiText id="services.noMatch" variant="body" tone="muted" align="center" />
        </Card>
      ) : (
        <View style={styles.grid}>
          {shown.map(({ l, idx }) => (
            <View key={l.id} style={wide ? styles.cellWide : styles.cell}>
              <ServiceCard
                headline={l.headline}
                headlineI18n={extras[l.id]?.headlineI18n}
                workerName={cards[l.id]?.workerName}
                rating={cards[l.id]?.rating}
                reviewCount={cards[l.id]?.reviewCount}
                verified={cards[l.id]?.verified}
                jobsDone={cards[l.id]?.jobsDone}
                areas={extras[l.id]?.areas}
                photos={photos[l.id]}
                featured={!!boostChipLabel({ is_boosted: l.is_boosted, boost_weight: l.boost_weight })}
                viewOnly={isWorker}
                onPress={() => openListing(l, idx)}
              />
            </View>
          ))}
        </View>
      )}
        </>
      ) : null}

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
    </ScrollView>
  );
}

function CategoryPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.catPill, active && styles.catPillActive]}>
      <Text style={[typography.label, active ? styles.catPillTextActive : styles.catPillText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1 },
  cardTitle: { marginBottom: spacing.md },
  listingsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, marginBottom: spacing.sm },
  searchBox: { marginBottom: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cell: { width: '100%' },
  cellWide: { width: '48.8%' },
  discoverySubtitle: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md },
  empty: { paddingVertical: spacing.lg, alignItems: 'center' },
  emptyCta: { marginTop: spacing.md },
  filterRow: { marginBottom: spacing.md, flexGrow: 0 },
  catPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  catPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catPillText: { color: colors.textBody },
  catPillTextActive: { color: colors.primaryInk },
  listingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  listingBody: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  listingHeadline: { ...typography.subtitle, color: colors.textStrong },
  switchBox: { gap: spacing.sm, marginBottom: spacing.sm },
  tabs: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 4, marginBottom: spacing.md },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.pill },
  tabOn: { backgroundColor: colors.primary },
  tabText: { color: colors.textBody },
  tabTextOn: { color: colors.primaryInk },
  mine: { gap: spacing.sm, marginTop: spacing.md },
  mineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  mineBody: { flex: 1, gap: 4, alignItems: 'flex-start' },
  mineTitle: { ...typography.subtitle, color: colors.textStrong },
  listingAreas: { ...typography.bodySm, color: colors.textMuted, marginTop: 2 },
  cover: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.border },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chevron: { padding: 4 },
  guestHint: { marginTop: spacing.md, gap: spacing.sm },
});
