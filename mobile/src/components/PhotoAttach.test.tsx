import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PhotoAttach } from './PhotoAttach';

const mockCheck = jest.fn();

jest.mock('../lib/imageQuality', () => ({ checkImageQuality: (u: string) => mockCheck(u) }));
jest.mock('../lib/pickImage', () => ({ pickImage: jest.fn() }));
jest.mock('../lib/jobMedia', () => ({ MAX_PHOTOS: 4 }));

const metrics = { frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const ui = (uris: string[]) => (
  <SafeAreaProvider initialMetrics={metrics}>
    <PhotoAttach uris={uris} onChange={jest.fn()} />
  </SafeAreaProvider>
);

describe('PhotoAttach quality note', () => {
  beforeEach(() => mockCheck.mockReset());

  it('puts a friendly note on each photo, in English and Urdu', async () => {
    mockCheck.mockImplementation((u: string) => Promise.resolve(u === 'a.jpg' ? 'good' : 'dark'));
    const u = render(ui(['a.jpg', 'b.jpg']));
    expect(await u.findByText('Good photo')).toBeTruthy();
    expect(u.getByText('اچھی تصویر')).toBeTruthy();
    expect(await u.findByText('Too dark. Add light.')).toBeTruthy();
  });

  it('checks each photo once, and shows nothing when it could not be read', async () => {
    mockCheck.mockResolvedValue(null);
    const u = render(ui(['a.jpg']));
    await waitFor(() => expect(mockCheck).toHaveBeenCalledTimes(1));
    u.rerender(ui(['a.jpg']));
    expect(mockCheck).toHaveBeenCalledTimes(1);
    expect(u.queryByText('Good photo')).toBeNull();
  });
});
