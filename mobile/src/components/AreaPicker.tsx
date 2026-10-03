import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '../i18n/useT';
import { looksLikeContact } from '../lib/contactCheck';
import { reverseGeocode } from '../lib/geocode';
import { useAreas, useCities, type City } from '../lib/locations';
import { getMyLocation } from '../lib/myLocation';
import { colors, radius, spacing } from '../theme/tokens';
import { typography } from '../theme/typography';

import { LocationPickerModal, type PinnedLocation } from './LocationPickerModal';
import { BiText } from './ui/BiText';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { Input } from './ui/Input';
import { SelectField } from './ui/SelectField';

export const MAX_AREAS = 10;

type Props = {
  value: string[];
  onChange: (areas: string[]) => void;
  /** Pre-select this city (the Ustad's own) when the list has it. */
  defaultCity?: string | null;
};

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const matchCity = (cities: City[], name: string | null): City | undefined => {
  if (!name) return undefined;
  const b = name.toLowerCase();
  return cities.find((c) => {
    const a = c.name.toLowerCase();
    return a === b || b.includes(a) || a.includes(b);
  });
};

/**
 * Pick the areas you work in from the admin-managed city and area lists, add one that is not listed, or let the
 * phone (or a pin on the map, on a PC without location) find where you are.
 */
export function AreaPicker({ value, onChange, defaultCity }: Props) {
  const { t } = useT();
  const cities = useCities();
  const [cityId, setCityId] = useState<string | null>(null);
  const areas = useAreas(cityId);
  const [other, setOther] = useState('');
  const [locating, setLocating] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  // An area suggested by the location, applied once that city's list has loaded.
  const [pending, setPending] = useState<string | null>(null);
  const defaultApplied = useRef(false);

  useEffect(() => {
    if (defaultApplied.current || cities.loading || !defaultCity) return;
    defaultApplied.current = true;
    const hit = matchCity(cities.items, defaultCity);
    if (hit) setCityId(hit.id);
  }, [cities.loading, cities.items, defaultCity]);

  const full = value.length >= MAX_AREAS;

  const add = (name: string) => {
    const clean = name.trim().replace(/[,\n،]/g, ' ').replace(/\s+/g, ' ').slice(0, 40);
    if (!clean || value.some((v) => sameName(v, clean)) || value.length >= MAX_AREAS) return;
    onChange([...value, clean]);
  };

  const toggle = (name: string) => {
    const has = value.find((v) => sameName(v, name));
    if (has) onChange(value.filter((v) => !sameName(v, name)));
    else add(name);
  };

  // Once the located city's areas are in, tick the one that matches (or add what was found as typed).
  useEffect(() => {
    if (!pending || areas.loading || !cityId) return;
    const hit = areas.items.find((a) => sameName(a.name, pending));
    add(hit ? hit.name : pending);
    setPending(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, areas.items, areas.loading, cityId]);

  const applyPlace = async (lat: number, lng: number) => {
    const found = await reverseGeocode(lat, lng);
    if (!found) {
      setNotFound(true);
      return;
    }
    const city = matchCity(cities.items, found.city);
    if (city) setCityId(city.id);
    if (found.area) {
      if (city) setPending(found.area);
      else add(found.area);
    }
    if (!city && !found.area) setNotFound(true);
  };

  const useMyLocation = async () => {
    setNotFound(false);
    setLocating(true);
    const pos = await getMyLocation();
    if (!pos) {
      setLocating(false);
      setMapOpen(true); // No device location (a PC, or permission refused): let them pin it instead.
      return;
    }
    await applyPlace(pos.lat, pos.lng);
    setLocating(false);
  };

  const onPinned = async (loc: PinnedLocation) => {
    setMapOpen(false);
    setNotFound(false);
    setLocating(true);
    await applyPlace(loc.lat, loc.lng);
    setLocating(false);
  };

  const cityOptions = useMemo(() => cities.items.map((c) => ({ value: c.id, label: c.name })), [cities.items]);
  const otherError = other.trim() && looksLikeContact(other);

  return (
    <View style={styles.wrap}>
      <BiText id="listing.field.areas" variant="label" tone="body" />
      <BiText id="areas.hint" variant="caption" tone="muted" />

      <Button
        labelId="areas.useMyLocation"
        onPress={useMyLocation}
        variant="secondary"
        iconLeft="crosshair"
        loading={locating}
        disabled={locating}
        fullWidth
      />
      {locating ? <Text style={styles.note}>{t('areas.locating').en}</Text> : null}
      {notFound ? <Text style={styles.note}>{t('areas.notFound').en}</Text> : null}

      <SelectField
        label={t('pick.city').en}
        placeholder={t('pick.cityPh').en}
        options={cityOptions}
        value={cityId}
        loading={cities.loading}
        failed={cities.failed}
        onRetry={cities.reload}
        onChange={setCityId}
      />

      {cityId ? (
        <View style={styles.chips}>
          {areas.loading ? <Text style={styles.note}>{t('common.loading').en}</Text> : null}
          {areas.items.map((a) => {
            const on = value.some((v) => sameName(v, a.name));
            return (
              <Pressable
                key={a.id}
                onPress={() => toggle(a.name)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                disabled={!on && full}
                style={[styles.chip, on && styles.chipOn, !on && full && styles.chipOff]}
              >
                <Text style={[typography.label, on ? styles.chipTextOn : styles.chipText]}>{a.name}</Text>
              </Pressable>
            );
          })}
          {!areas.loading && areas.items.length === 0 ? <BiText id="areas.noneListed" variant="caption" tone="muted" /> : null}
        </View>
      ) : null}

      <View style={styles.otherRow}>
        <View style={styles.otherInput}>
          <Input
            value={other}
            onChangeText={setOther}
            placeholderId="areas.otherPh"
            iconLeft="plus"
            error={otherError ? t('ai.error.contact').en : null}
            hideUrduHint
          />
        </View>
        <Button
          labelId="areas.add"
          onPress={() => {
            add(other);
            setOther('');
          }}
          variant="secondary"
          disabled={!other.trim() || !!otherError || full}
          hideUrdu
        />
      </View>

      <View style={styles.selected}>
        <Text style={styles.selectedTitle}>
          {t('areas.selected').en} ({value.length}/{MAX_AREAS})
        </Text>
        {value.length === 0 ? (
          <BiText id="areas.none" variant="caption" tone="muted" />
        ) : (
          <View style={styles.chips}>
            {value.map((a) => (
              <View key={a} style={styles.picked}>
                <Text style={styles.pickedText}>{a}</Text>
                <Pressable
                  onPress={() => onChange(value.filter((v) => v !== a))}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('media.remove').en} ${a}`}
                  hitSlop={8}
                >
                  <Icon name="x" size={14} color={colors.primaryDeep} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      <LocationPickerModal visible={mapOpen} initial={null} onConfirm={onPinned} onClose={() => setMapOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  note: { ...typography.caption, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipOff: { opacity: 0.4 },
  chipText: { color: colors.textBody },
  chipTextOn: { color: colors.primaryInk },
  otherRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  otherInput: { flex: 1 },
  selected: { gap: spacing.sm, paddingTop: spacing.xs },
  selectedTitle: { ...typography.label, color: colors.textStrong },
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  pickedText: { ...typography.label, color: colors.primaryDeep },
});
