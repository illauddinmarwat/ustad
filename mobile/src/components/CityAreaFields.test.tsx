import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useCityAreaFields } from './CityAreaFields';

const mockHere = jest.fn();

jest.mock('../lib/myLocation', () => ({ getMyLocation: () => mockHere() }));
jest.mock('../lib/geocode', () => ({
  reverseGeocode: () => Promise.resolve({ city: 'Karachi', area: 'Gulshan', displayName: 'Block 4, Gulshan' }),
}));
jest.mock('../lib/locations', () => ({
  useCities: () => ({ items: [{ id: 'c1', name: 'Karachi' }], loading: false, failed: false, reload: jest.fn() }),
  useAreas: (cityId: string | null) => ({
    items: cityId ? [{ id: 'a1', name: 'Gulshan' }] : [],
    loading: false,
    failed: false,
    reload: jest.fn(),
  }),
}));

const wrap = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      {ui}
    </SafeAreaProvider>,
  );

function Harness({ saved }: { saved?: string | null }) {
  const place = useCityAreaFields({ cityName: saved ?? null, areaName: null, addressDetails: null, location: null });
  return (
    <>
      {place.fields}
      {/* eslint-disable-next-line @typescript-eslint/no-require-imports */}
      {React.createElement(require('react-native').Text, { testID: 'out' }, `${place.cityName}|${place.areaName}`)}
    </>
  );
}

describe('place fields: Use my location', () => {
  beforeEach(() => mockHere.mockReset());

  it('fills city and area from the device position', async () => {
    mockHere.mockResolvedValue({ lat: 24.9, lng: 67.1 });
    const u = wrap(<Harness />);
    fireEvent.press(u.getByText('Use my location'));
    await waitFor(() => expect(u.getByTestId('out').props.children).toBe('Karachi|Gulshan'));
  });

  it('starts on the city saved in the profile', async () => {
    const u = wrap(<Harness saved="Karachi" />);
    await waitFor(() => expect(u.getByTestId('out').props.children).toBe('Karachi|'));
  });

  it('leaves the fields alone when the position is not available', async () => {
    mockHere.mockResolvedValue(null);
    const u = wrap(<Harness />);
    fireEvent.press(u.getByText('Use my location'));
    await waitFor(() => expect(mockHere).toHaveBeenCalled());
    expect(u.getByTestId('out').props.children).toBe('|');
  });
});
