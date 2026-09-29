import { useMemo, useState } from 'react';

import { useT } from '../i18n/useT';
import { useAreas, useCities } from '../lib/locations';

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
  fields: React.ReactElement;
};

/** City → Area pickers (admin-managed lists) plus an optional address-details line. */
export function useCityAreaFields(): CityAreaState {
  const { t } = useT();
  const cities = useCities();
  const [cityId, setCityId] = useState<string | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [otherArea, setOtherArea] = useState('');
  const [addressDetails, setAddressDetails] = useState('');
  const areas = useAreas(cityId);

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
      <Input
        value={addressDetails}
        onChangeText={setAddressDetails}
        labelId="pick.addressDetails"
        placeholderId="pick.addressDetailsPh"
        iconLeft="home"
      />
    </>
  );

  return {
    cityId,
    cityName,
    areaName,
    addressDetails: addressDetails.trim(),
    complete: !!cityName && !!areaName,
    fields,
  };
}
