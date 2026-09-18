import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { useCallback, useRef, useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../../components/ui/Avatar';
import { BiText } from '../../components/ui/BiText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { useT } from '../../i18n/useT';
import { SKILL_CATEGORIES } from '../../lib/skillCategories';
import { distanceKm, estimateEtaMinutes, type LatLng } from '../../lib/realtime';
import { supabase } from '../../lib/supabase';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'JobTracking'>;

type WorkerInfo = {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  photo_url: string | null;
  avg_rating: number | null;
  review_count: number | null;
  categories: string[] | null;
};

type TrackState = {
  is_en_route: boolean;
  lat: number | null;
  lng: number | null;
};

const POLL_MS = 8000;

export default function JobTrackingScreen({ route }: Props) {
  const { jobId } = route.params;
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const mapRef = useRef<MapView | null>(null);

  const [worker, setWorker] = useState<WorkerInfo | null>(null);
  const [track, setTrack] = useState<TrackState | null>(null);
  const [myCoords, setMyCoords] = useState<LatLng | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

  const requestMyLocation = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setLocationDenied(true);
      return;
    }
    setLocationDenied(false);
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setMyCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
  }, []);

  const loadWorker = useCallback(async () => {
    const { data: job } = await supabase.from('jobs').select('worker_id').eq('id', jobId).maybeSingle();
    if (!job?.worker_id) return;
    const [{ data: profile }, { data: wp }] = await Promise.all([
      supabase.from('profiles').select('id,display_name,phone').eq('id', job.worker_id).maybeSingle(),
      supabase
        .from('worker_profiles')
        .select('photo_url,avg_rating,review_count,categories')
        .eq('user_id', job.worker_id)
        .maybeSingle(),
    ]);
    if (profile) {
      setWorker({
        user_id: profile.id,
        display_name: profile.display_name,
        phone: profile.phone,
        photo_url: wp?.photo_url ?? null,
        avg_rating: wp?.avg_rating ?? null,
        review_count: wp?.review_count ?? null,
        categories: wp?.categories ?? null,
      });
    }
  }, [jobId]);

  const pollTrack = useCallback(async () => {
    const { data } = await supabase
      .from('job_realtime_states')
      .select('is_en_route,lat,lng')
      .eq('job_id', jobId)
      .maybeSingle();
    setTrack({
      is_en_route: data?.is_en_route ?? false,
      lat: data?.lat ?? null,
      lng: data?.lng ?? null,
    });
  }, [jobId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadWorker();
      requestMyLocation();
      pollTrack();
      const interval = setInterval(() => {
        if (!cancelled) pollTrack();
      }, POLL_MS);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobId])
  );

  const workerCoords: LatLng | null = track?.lat != null && track?.lng != null ? { lat: track.lat, lng: track.lng } : null;
  const dist = myCoords && workerCoords ? distanceKm(myCoords, workerCoords) : null;
  const etaMin = dist != null ? estimateEtaMinutes(dist) : null;

  const openLiveLocation = () => {
    if (!workerCoords) return;
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${workerCoords.lat},${workerCoords.lng}`).catch(
      () => {}
    );
  };

  const callWorker = () => {
    if (!worker?.phone) return;
    Linking.openURL(`tel:${worker.phone}`).catch(() => {});
  };

  const skillLabel = worker?.categories?.[0]
    ? SKILL_CATEGORIES.find((c) => c.key === worker.categories?.[0])?.labelId
    : null;

  const region = myCoords
    ? { latitude: myCoords.lat, longitude: myCoords.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }
    : workerCoords
      ? { latitude: workerCoords.lat, longitude: workerCoords.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }
      : undefined;

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      {locationDenied || !myCoords ? (
        <Card padding="lg" style={styles.permissionCard}>
          <EmptyState
            icon="map-pin"
            titleId="tracking.permission.title"
            subtitleId="tracking.permission.subtitle"
            ctaLabelId="tracking.permission.cta"
            onCta={requestMyLocation}
          />
        </Card>
      ) : (
        <MapView ref={mapRef} style={styles.map} initialRegion={region} region={region}>
          <Marker coordinate={{ latitude: myCoords.lat, longitude: myCoords.lng }} title={t('tracking.you').en} pinColor={colors.info} />
          {workerCoords && (
            <Marker
              coordinate={{ latitude: workerCoords.lat, longitude: workerCoords.lng }}
              title={worker?.display_name ?? 'Ustad'}
              description={t('tracking.moving').en}
              pinColor={colors.primary}
            />
          )}
          {workerCoords && (
            <Polyline
              coordinates={[
                { latitude: myCoords.lat, longitude: myCoords.lng },
                { latitude: workerCoords.lat, longitude: workerCoords.lng },
              ]}
              strokeColor={colors.primary}
              strokeWidth={3}
              lineDashPattern={[8, 6]}
            />
          )}
        </MapView>
      )}

      <View style={styles.sheet}>
        {!workerCoords ? (
          <Card padding="lg">
            <BiText id="tracking.waiting.title" variant="title" tone="strong" />
            <BiText id="tracking.waiting.subtitle" variant="body" tone="muted" />
          </Card>
        ) : (
          <Card padding="lg">
            <View style={styles.profileRow}>
              {worker?.photo_url ? (
                <Image source={{ uri: worker.photo_url }} style={styles.photo} />
              ) : (
                <Avatar name={worker?.display_name} size={52} tone="primary" />
              )}
              <View style={styles.profileBody}>
                <Text style={styles.name} numberOfLines={1}>
                  {worker?.display_name ?? 'Ustad'}
                  {skillLabel ? ` · ${t(skillLabel).en}` : ''}
                </Text>
                {worker?.avg_rating != null && (
                  <View style={styles.ratingRow}>
                    <Icon name="star" size={12} color={colors.warning} />
                    <Text style={styles.ratingText}>
                      {worker.avg_rating.toFixed(1)} · {worker.review_count ?? 0} reviews
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.chipRow}>
              {dist != null && <Chip label={`${dist.toFixed(1)} km ${t('tracking.away').en}`} tone="primary" icon="map-pin" />}
              {etaMin != null && <Chip label={`${etaMin} ${t('tracking.etaAway').en}`} tone="accent" icon="clock" />}
            </View>

            <View style={styles.actionRow}>
              <Button
                labelId="tracking.call"
                onPress={callWorker}
                variant="secondary"
                iconLeft="phone"
                hideUrdu
                disabled={!worker?.phone}
                style={styles.actionBtn}
              />
              <Button
                labelId="tracking.liveLocation"
                onPress={openLiveLocation}
                iconLeft="navigation"
                hideUrdu
                style={styles.actionBtn}
              />
            </View>
          </Card>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  map: { flex: 1 },
  permissionCard: { flex: 1, justifyContent: 'center' },
  sheet: { padding: spacing.lg },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  photo: { width: 52, height: 52, borderRadius: radius.pill },
  profileBody: { flex: 1, marginLeft: spacing.md },
  name: { ...typography.subtitle, color: colors.textStrong },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  ratingText: { ...typography.caption, color: colors.textMuted },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: spacing.md },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionBtn: { flex: 1 },
});
