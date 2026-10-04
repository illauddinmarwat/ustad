import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useT } from '../i18n/useT';
import { reverseGeocode } from '../lib/geocode';
import { getMyLocation } from '../lib/myLocation';
import { useAreas, useCities } from '../lib/locations';
import { colors, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { LocationPickerModal, type PinnedLocation } from './LocationPickerModal';
import { Button } from './ui/Button';

import { Input } from './ui/Input';
import { SelectField } from './ui/SelectField';

const OTHER = '__other__';

export type CityAreaState = {
  cityId: string | null;
  cityName: string;
  areaName: string;
  addressDetails: string;
  /** City chosen and an area chosen (or typed under "Other"). */
  complete: boolean;
  /** Map pin chosen by the user, if any. */
  location: PinnedLocation | null;
  fields: React.ReactElement;
};

/** City → Area pickers (admin-managed lists) plus an optional address-details line. */
export type CityAreaInitial = { cityName: string | null; areaName: string | null; addressDetails: string | null; location: PinnedLocation | null };

export function useCityAreaFields(initial?: CityAreaInitial): CityAreaState {
  const { t } = useT();
  const cities = useCities();
  const [cityId, setCityId] = useState<string | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [otherArea, setOtherArea] = useState('');
  const [addressDetails, setAddressDetails] = useState(initial?.addressDetails ?? '');
  const areas = useAreas(cityId);
  const [location, setLocation] = useState<PinnedLocation | null>(initial?.location ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [looking, setLooking] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  // Area suggested by the map pin, applied once that city's area list has loaded.
  const [pendingArea, setPendingArea] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingArea || areas.loading || !cityId) return;
    const hit = areas.items.find((a) => a.name.toLowerCase() === pendingArea.toLowerCase());
    if (hit) {
      setArea(hit.name);
      setOtherArea('');
    } else {
      setArea(OTHER);
      setOtherArea(pendingArea);
    }
    setPendingArea(null);
  }, [pendingArea, areas.items, areas.loading, cityId]);

  // Pre-select the saved city (and, once its areas load, the saved area) when editing an existing application.
  // The saved city may arrive after the first render (read from the profile), so it is applied whenever it
  // changes, as long as the person has not chosen a city themselves.
  const [appliedFor, setAppliedFor] = useState<string | null>(null);
  useEffect(() => {
    const wanted = initial?.cityName;
    if (!wanted || appliedFor === wanted || cities.loading) return;
    const hit = cities.items.find((c) => c.name.toLowerCase() === wanted.toLowerCase());
    if (hit && !cityId) {
      setCityId(hit.id);
      if (initial?.areaName) setPendingArea(initial.areaName);
    }
    setAppliedFor(wanted);
  }, [appliedFor, cityId, cities.loading, cities.items, initial]);

  const onPinned = async (loc: PinnedLocation) => {
    setPickerOpen(false);
    setLocation(loc);
    setLooking(true);
    setLookupFailed(false);
    const found = await reverseGeocode(loc.lat, loc.lng);
    setLooking(false);
    if (!found) {
      setLookupFailed(true);
      return;
    }
    setAddressDetails(found.displayName);
    const cityHit = found.city
      ? cities.items.find((c) => {
          const a = c.name.toLowerCase();
          const b = found.city!.toLowerCase();
          return a === b || b.includes(a) || a.includes(b);
        })
      : undefined;
    if (cityHit) {
      setCityId(cityHit.id);
      setArea(null);
      setOtherArea('');
      setPendingArea(found.area);
    }
  };

  // Use my location: the device position fills city and area; when it is not available the map opens instead.
  const useMyLocation = async () => {
    setLookupFailed(false);
    setLooking(true);
    const here = await getMyLocation();
    setLooking(false);
    if (!here) {
      setPickerOpen(true);
      return;
    }
    await onPinned({ lat: here.lat, lng: here.lng });
  };

  const cityName = cities.items.find((c) => c.id === cityId)?.name ?? '';
  const areaName = area === OTHER ? otherArea.trim() : (area ?? '');

  const cityOptions = useMemo(() => cities.items.map((c) => ({ value: c.id, label: c.name })), [cities.items]);
  const areaOptions = useMemo(() => areas.items.map((a) => ({ value: a.name, label: a.name })), [areas.items]);

  const fields = (
    <>
      <SelectField
        label={t('pick.city').en}
        placeholder={t('pick.cityPh').en}
        options={cityOptions}
        value={cityId}
        loading={cities.loading}
        failed={cities.failed}
        onRetry={cities.reload}
        onChange={(id) => {
          setCityId(id);
          setArea(null);
          setOtherArea('');
        }}
      />
      <SelectField
        label={t('pick.area').en}
        placeholder={t('pick.areaPh').en}
        options={areaOptions}
        value={area}
        disabled={!cityId}
        loading={areas.loading}
        failed={areas.failed}
        onRetry={areas.reload}
        extraOption={{ value: OTHER, label: t('pick.areaOther').en }}
        onChange={setArea}
        iconLeft="map"
      />
      {area === OTHER ? (
        <Input
          value={otherArea}
          onChangeText={setOtherArea}
          placeholderId="pick.otherAreaPh"
          iconLeft="map"
        />
      ) : null}
      <Button
        labelId="areas.useMyLocation"
        onPress={useMyLocation}
        variant="secondary"
        iconLeft="crosshair"
        fullWidth
        style={styles.pinBtn}
      />
      <Button
        labelId={location ? 'map.pinnedButton' : 'map.pinButton'}
        onPress={() => setPickerOpen(true)}
        variant="secondary"
        iconLeft="map-pin"
        fullWidth
        style={styles.pinBtn}
      />
      {looking ? <Text style={styles.note}>{t('map.looking').en}</Text> : null}
      {lookupFailed ? <Text style={styles.note}>{t('map.addressFailed').en}</Text> : null}
      <Input
        value={addressDetails}
        onChangeText={setAddressDetails}
        labelId="pick.addressDetails"
        placeholderId="pick.addressDetailsPh"
        iconLeft="home"
      />
      <LocationPickerModal
        visible={pickerOpen}
        initial={location}
        onConfirm={onPinned}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );

  return {
    location,
    cityId,
    cityName,
    areaName,
    addressDetails: addressDetails.trim(),
    complete: !!cityName && !!areaName,
    fields,
  };
}

const styles = StyleSheet.create({
  pinBtn: { marginBottom: spacing.sm },
  note: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
});
