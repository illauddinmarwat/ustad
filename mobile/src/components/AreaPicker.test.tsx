import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AreaPicker, MAX_AREAS } from './AreaPicker';

const mockGetLocation = jest.fn();
const mockGeocode = jest.fn();

jest.mock('../lib/locations', () => ({
  useCities: () => ({
    items: [
      { id: 'karachi', name: 'Karachi' },
      { id: 'lahore', name: 'Lahore' },
    ],
    loading: false,
    failed: false,
    reload: jest.fn(),
  }),
  useAreas: (cityId: string | null) => ({
    items:
      cityId === 'karachi'
        ? [
            { id: 'a1', name: 'Gulshan' },
            { id: 'a2', name: 'DHA' },
          ]
        : cityId === 'lahore'
          ? [{ id: 'a3', name: 'Model Town' }]
          : [],
    loading: false,
    failed: false,
    reload: jest.fn(),
  }),
}));
jest.mock('../lib/myLocation', () => ({ getMyLocation: (...a: unknown[]) => mockGetLocation(...a) }));
jest.mock('../lib/geocode', () => ({ reverseGeocode: (...a: unknown[]) => mockGeocode(...a) }));
jest.mock('./LocationPickerModal', () => {
  const { Text } = require('react-native');
  return {
    LocationPickerModal: ({ visible, onConfirm }: { visible: boolean; onConfirm: (l: { lat: number; lng: number }) => void }) =>
      visible ? <Text onPress={() => onConfirm({ lat: 24.86, lng: 67.0 })}>Confirm pin</Text> : null,
  };
});

function Harness({ initial = [], defaultCity = 'Karachi' }: { initial?: string[]; defaultCity?: string | null }) {
  const [value, setValue] = React.useState<string[]>(initial);
  return (
    <>
      <AreaPicker value={value} onChange={setValue} defaultCity={defaultCity} />
      {/* eslint-disable-next-line react-native/no-raw-text */}
      {React.createElement(require('react-native').Text, { testID: 'out' }, value.join('|'))}
    </>
  );
}

const wrap = (node: React.ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      {node}
    </SafeAreaProvider>,
  );

const out = (u: ReturnType<typeof render>) => u.getByTestId('out').props.children;

beforeEach(() => {
  mockGetLocation.mockReset();
  mockGeocode.mockReset();
});

describe('AreaPicker', () => {
  it('opens on the Ustad city and lists its areas from the backend', async () => {
    const u = wrap(<Harness />);
    expect(await u.findByText('Gulshan')).toBeTruthy();
    expect(u.getByText('DHA')).toBeTruthy();
    expect(u.getByText('No areas picked yet.')).toBeTruthy();
  });

  it('picks and unpicks an area by tapping it, and shows the picked areas', async () => {
    const u = wrap(<Harness />);
    fireEvent.press(await u.findByText('Gulshan'));
    expect(out(u)).toBe('Gulshan');
    expect(u.getByText('Your areas (1/10)')).toBeTruthy();
    fireEvent.press(u.getAllByText('Gulshan')[0]);
    expect(out(u)).toBe('');
  });

  it('removes a picked area with its cross', async () => {
    const u = wrap(<Harness initial={['Gulshan', 'DHA']} />);
    await u.findByText('Your areas (2/10)');
    fireEvent.press(u.getByLabelText('Remove DHA'));
    expect(out(u)).toBe('Gulshan');
  });

  it('keeps picks from one city when another city is chosen', async () => {
    const u = wrap(<Harness initial={['Gulshan']} />);
    await u.findByText('Your areas (1/10)');
    fireEvent.press(u.getByText('Karachi'));
    fireEvent.press(await u.findByText('Lahore'));
    fireEvent.press(await u.findByText('Model Town'));
    expect(out(u)).toBe('Gulshan|Model Town');
  });

  it('adds an area that is not in the list, once', async () => {
    const u = wrap(<Harness />);
    await u.findByText('Gulshan');
    const input = u.getByPlaceholderText('Another area (not in the list)');
    fireEvent.changeText(input, 'Bahria Town');
    fireEvent.press(u.getByText('Add'));
    expect(out(u)).toBe('Bahria Town');
    fireEvent.changeText(input, 'bahria town');
    fireEvent.press(u.getByText('Add'));
    expect(out(u)).toBe('Bahria Town');
  });

  it('refuses a phone number as an area', async () => {
    const u = wrap(<Harness />);
    await u.findByText('Gulshan');
    fireEvent.changeText(u.getByPlaceholderText('Another area (not in the list)'), '03001234567');
    expect(await u.findByText(/remove phone numbers and links/i)).toBeTruthy();
    fireEvent.press(u.getByText('Add'));
    expect(out(u)).toBe('');
  });

  it('stops at ten areas', async () => {
    const ten = Array.from({ length: MAX_AREAS }, (_, i) => `Area ${i}`);
    const u = wrap(<Harness initial={ten} />);
    await u.findByText(`Your areas (${MAX_AREAS}/${MAX_AREAS})`);
    fireEvent.changeText(u.getByPlaceholderText('Another area (not in the list)'), 'One more');
    fireEvent.press(u.getByText('Add'));
    expect(out(u)).toBe(ten.join('|'));
  });
});

describe('AreaPicker: my location', () => {
  it('finds the city and ticks the matching listed area', async () => {
    mockGetLocation.mockResolvedValue({ lat: 24.9, lng: 67.1 });
    mockGeocode.mockResolvedValue({ displayName: 'x', city: 'Karachi', area: 'DHA' });
    const u = wrap(<Harness defaultCity={null} />);
    fireEvent.press(await u.findByText('Use my location'));
    await waitFor(() => expect(out(u)).toBe('DHA'));
    expect(mockGeocode).toHaveBeenCalledWith(24.9, 67.1);
  });

  it('adds a found area that the list does not have, as typed', async () => {
    mockGetLocation.mockResolvedValue({ lat: 24.9, lng: 67.1 });
    mockGeocode.mockResolvedValue({ displayName: 'x', city: 'Karachi', area: 'Clifton' });
    const u = wrap(<Harness defaultCity={null} />);
    fireEvent.press(await u.findByText('Use my location'));
    await waitFor(() => expect(out(u)).toBe('Clifton'));
  });

  it('adds the found area when its city is not in the list', async () => {
    mockGetLocation.mockResolvedValue({ lat: 31.5, lng: 74.3 });
    mockGeocode.mockResolvedValue({ displayName: 'x', city: 'Multan', area: 'Cantt' });
    const u = wrap(<Harness defaultCity={null} />);
    fireEvent.press(await u.findByText('Use my location'));
    await waitFor(() => expect(out(u)).toBe('Cantt'));
  });

  it('opens the map instead when the device has no location, and uses the pin', async () => {
    mockGetLocation.mockResolvedValue(null);
    mockGeocode.mockResolvedValue({ displayName: 'x', city: 'Karachi', area: 'Gulshan' });
    const u = wrap(<Harness defaultCity={null} />);
    fireEvent.press(await u.findByText('Use my location'));
    fireEvent.press(await u.findByText('Confirm pin'));
    await waitFor(() => expect(out(u)).toBe('Gulshan'));
    expect(mockGeocode).toHaveBeenCalledWith(24.86, 67.0);
  });

  it('says so when no area could be worked out', async () => {
    mockGetLocation.mockResolvedValue({ lat: 1, lng: 1 });
    mockGeocode.mockResolvedValue(null);
    const u = wrap(<Harness defaultCity={null} />);
    fireEvent.press(await u.findByText('Use my location'));
    expect(await u.findByText(/could not work out your area/)).toBeTruthy();
    expect(out(u)).toBe('');
  });
});
