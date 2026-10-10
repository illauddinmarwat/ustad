import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../../components/ui/Avatar';
import { Banner } from '../../components/ui/Banner';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { LocationPickerModal } from '../../components/LocationPickerModal';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { Input } from '../../components/ui/Input';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useT } from '../../i18n/useT';
import { fetchDirectRequestFlags } from '../../lib/directRequests';
import { forwardGeocode } from '../../lib/geocode';
import { useCities } from '../../lib/locations';
import { getMyLocation } from '../../lib/myLocation';
import { fetchJobPostingEnabled } from '../../lib/jobPosting';
import { skillNameFor, useSkillCategories } from '../../lib/skillCategories';
import { supabase } from '../../lib/supabase';
import type { RootStackParamList, TabParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { KeyboardAvoid } from '../../components/ui/KeyboardAvoid';

type NearbyWorker = {
  user_id: string;
  display_name: string | null;
  city: string | null;
  bio: string | null;
  categories: string[] | null;
  avg_rating: number | null;
  review_count: number | null;
  is_verified: boolean;
  rate_pkr: number | null;
  rate_unit: 'day' | 'hour' | null;
  years_experience: number | null;
  photo_url: string | null;
  distance_km: number;
  is_available?: boolean | null;
};

type NearbyNav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Nearby'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type Coords = { lat: number; lng: number };
type LocState = 'idle' | 'requesting' | 'granted' | 'denied';

export default function NearbyUstadScreen() {
  const navigation = useNavigation<NearbyNav>();
  const route = useRoute<RouteProp<TabParamList, 'Nearby'>>();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const categories = useSkillCategories();

  const [locState, setLocState] = useState<LocState>('idle');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [manualLabel, setManualLabel] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [pickFailed, setPickFailed] = useState(false);
  const cities = useCities();
  const [category, setCategory] = useState<string | null>(route.params?.category ?? null);
  useEffect(() => {
    setCategory(route.params?.category ?? null);
  }, [route.params?.category]);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<NearbyWorker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directEnabled, setDirectEnabled] = useState(false);
  const [postingEnabled, setPostingEnabled] = useState(false);

  useEffect(() => {
    fetchDirectRequestFlags().then((f) => setDirectEnabled(f.enabled));
    fetchJobPostingEnabled().then(setPostingEnabled);
  }, []);

  const requestLocation = useCallback(async () => {
    setLocState('requesting');
    setError(null);
    const pos = await getMyLocation();
    if (!pos) {
      setLocState('denied');
      return;
    }
    setManualLabel(null);
    setCoords(pos);
    setLocState('granted');
  }, []);

  // Where to look when the device cannot say (a PC with location off): a city from the list, or a pin on the map.
  const chooseCity = async (name: string) => {
    setPickFailed(false);
    const hit = await forwardGeocode(`${name}, Pakistan`);
    if (!hit) {
      setPickFailed(true);
      return;
    }
    setCoords({ lat: hit.lat, lng: hit.lng });
    setManualLabel(name);
    setLocState('granted');
  };

  const choosePin = (loc: Coords) => {
    setMapOpen(false);
    setPickFailed(false);
    setCoords(loc);
    setManualLabel('');
    setLocState('granted');
  };

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const load = useCallback(async () => {
    if (!coords) return;
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('nearby_workers', {
      p_lat: coords.lat,
      p_lng: coords.lng,
      p_category: category,
      p_limit: 30,
    });
    setLoading(false);
    if (rpcError) {
      setError(t('nearby.error.load').en);
      return;
    }
    setRows((data ?? []) as NearbyWorker[]);
  }, [coords, category, t]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => (r.display_name ?? '').toLowerCase().includes(q) || (r.bio ?? '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  const bookWorker = (worker: NearbyWorker) => {
    if (directEnabled) {
      navigation.navigate('RequestWorker', {
        workerId: worker.user_id,
        workerName: worker.display_name,
        category: category ?? worker.categories?.[0] ?? null,
      });
      return;
    }
    Alert.alert(t('nearby.card.book').en, t('nearby.book.notice').en, [
      { text: t('common.cancel').en, style: 'cancel' },
      { text: t('common.continue').en, onPress: () => navigation.navigate('Services') },
    ]);
  };

  return (
    <KeyboardAvoid style={styles.screen}>
      <View style={[styles.headerBar, { paddingTop: insets.top + spacing.md }]}>
        <ScreenHeader titleId="nearby.title" inverse />
        <Input
          value={query}
          onChangeText={setQuery}
          placeholderId="nearby.searchPh"
          iconLeft="search"
          containerStyle={styles.searchInput}
          hideUrduHint
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.root, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          <CategoryPill label={t('nearby.filterAll').en} active={category === null} onPress={() => setCategory(null)} />
          {categories.map((cat) => (
            <CategoryPill
              key={cat.key}
              label={cat.en}
              active={category === cat.key}
              onPress={() => setCategory(cat.key)}
            />
          ))}
        </ScrollView>

        {category ? (
          <Pressable
            onPress={() => navigation.navigate('Services', { category })}
            accessibilityRole="link"
            style={styles.crossLink}
          >
            <Icon name="grid" size={14} color={colors.primary} />
            <BiText id="nearby.seeServices" hideUrdu variant="label" tone="body" enStyle={styles.crossLinkText} />
          </Pressable>
        ) : null}

        {locState === 'requesting' && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {locState === 'denied' && (
          <Card padding="lg">
            <BiText id="nearby.locate.denied" variant="bodySm" tone="muted" style={styles.pickHint} />
            <BiText id="nearby.pick.title" variant="title" tone="strong" style={styles.pickTitle} />
            <BiText id="nearby.pick.hint" variant="bodySm" tone="muted" style={styles.pickHint} />
            <View style={styles.cityRow}>
              {cities.items.map((c) => (
                <CategoryPill key={c.id} label={c.name} active={false} onPress={() => chooseCity(c.name)} />
              ))}
            </View>
            <Button
              labelId="nearby.pick.map"
              onPress={() => setMapOpen(true)}
              variant="secondary"
              iconLeft="map"
              fullWidth
              style={styles.emptyCta}
            />
            <Button labelId="nearby.locate.cta" onPress={requestLocation} variant="ghost" iconLeft="map-pin" fullWidth />
            {pickFailed ? <Banner id="nearby.pick.failed" tone="warning" /> : null}
          </Card>
        )}

        {locState === 'granted' && manualLabel !== null ? (
          <View style={styles.nearRow}>
            <Text style={styles.nearText}>
              {t('nearby.near').en} {manualLabel || t('nearby.near.pinned').en}
            </Text>
            <Pressable onPress={requestLocation} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.nearChange}>{t('nearby.change').en}</Text>
            </Pressable>
          </View>
        ) : null}

        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {error ? <Banner text={error} tone="warning" /> : null}

        {!loading && locState === 'granted' && filteredRows.length === 0 && !error && (
          <Card padding="lg">
            <BiText id="nearby.empty" variant="body" tone="muted" align="center" />
            {postingEnabled ? (
              <Button
                labelId="nearby.postInstead"
                onPress={() => navigation.navigate('PostJob')}
                variant="secondary"
                iconLeft="plus-circle"
                fullWidth
                style={styles.emptyCta}
              />
            ) : null}
          </Card>
        )}

        {filteredRows.map((worker) => (
          <WorkerCard
            key={worker.user_id}
            worker={worker}
            onBook={() => bookWorker(worker)}
            directEnabled={directEnabled}
          />
        ))}
      </ScrollView>
      <LocationPickerModal visible={mapOpen} initial={null} onConfirm={choosePin} onClose={() => setMapOpen(false)} />
    </KeyboardAvoid>
  );
}

function CategoryPill({
  label,
  icon,
  iconSet,
  active,
  onPress,
}: {
  label: string;
  icon?: Parameters<typeof Icon>[0]['name'];
  iconSet?: Parameters<typeof Icon>[0]['set'];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.catPill, active && styles.catPillActive]}>
      {icon ? <Icon name={icon} set={iconSet} size={13} color={active ? colors.primaryInk : colors.primaryDeep} /> : null}
      <Text style={[typography.label, styles.catPillLabel, active && styles.catPillLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function WorkerCard({
  worker,
  onBook,
  directEnabled,
}: {
  worker: NearbyWorker;
  onBook: () => void;
  directEnabled: boolean;
}) {
  const { t } = useT();
  const skillText = skillNameFor(worker.categories?.[0])?.en ?? null;

  return (
    <Card padding="lg">
      <View style={styles.cardTop}>
        {worker.photo_url ? (
          <Image source={{ uri: worker.photo_url }} style={styles.photo} />
        ) : (
          <Avatar name={worker.display_name} size={48} tone="primary" />
        )}
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>
            {worker.display_name ?? 'Ustad'}
            {skillText ? ` · ${skillText}` : ''}
          </Text>
          <View style={styles.metaRow}>
            {worker.avg_rating != null && (
              <View style={styles.metaItem}>
                <Icon name="star" size={12} color={colors.warning} />
                <Text style={styles.metaText}>{worker.avg_rating.toFixed(1)}</Text>
              </View>
            )}
            <View style={styles.metaItem}>
              <Icon name="map-pin" size={12} color={colors.textMuted} />
              <Text style={styles.metaText}>{worker.distance_km.toFixed(1)}km</Text>
            </View>
            {worker.years_experience != null && (
              <View style={styles.metaItem}>
                <Icon name="clock" size={12} color={colors.textMuted} />
                <Text style={styles.metaText}>
                  {worker.years_experience} {t('nearby.card.years').en}
                </Text>
              </View>
            )}
          </View>
          {worker.city ? (
            <View style={styles.metaItem}>
              <Icon name="map" size={12} color={colors.textMuted} />
              <Text style={styles.metaText}>{worker.city}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.chipRow}>
        {worker.is_verified && <Chip label={t('nearby.card.verified').en} tone="accent" icon="check-circle" />}
        {worker.is_available === false ? (
          <Chip label={t('nearby.card.busy').en} tone="neutral" icon="clock" />
        ) : (
          <Chip label={t('nearby.card.available').en} tone="accent" icon="zap" />
        )}
      </View>

      <View style={styles.actionRow}>
        <Button
          labelId={directEnabled ? 'nearby.card.sendRequest' : 'nearby.card.book'}
          onPress={onBook}
          iconLeft={directEnabled ? 'send' : 'calendar'}
          hideUrdu
          style={styles.actionBtn}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerBar: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  searchInput: { marginBottom: 0 },
  root: { padding: spacing.lg, flexGrow: 1 },
  filterRow: { marginBottom: spacing.md, flexGrow: 0 },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  catPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catPillLabel: { color: colors.textBody },
  catPillLabelActive: { color: colors.primaryInk },
  loadingRow: { paddingVertical: spacing.lg, alignItems: 'center' },
  cardTop: { flexDirection: 'row' },
  photo: { width: 48, height: 48, borderRadius: radius.pill },
  cardBody: { flex: 1, marginLeft: spacing.md },
  cardName: { ...typography.subtitle, color: colors.textStrong },
  metaRow: { flexDirection: 'row', gap: spacing.md, marginTop: 4, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { ...typography.caption, color: colors.textMuted },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: spacing.md },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionBtn: { flex: 1 },
  emptyCta: { marginTop: spacing.md },
  pickTitle: { marginBottom: spacing.xs },
  pickHint: { marginBottom: spacing.md },
  cityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  nearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  nearText: { ...typography.label, color: colors.primaryDeep, flex: 1 },
  nearChange: { ...typography.label, color: colors.primary },
  crossLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md },
  crossLinkText: { color: colors.primary },
});
