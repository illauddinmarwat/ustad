import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { TradesSetting } from './TradesSetting';

const mockRpc = jest.fn();
const mockCats: { current: string[] | null } = { current: ['plumber'] };

jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'w1' } } }) }));
jest.mock('../lib/skillCategories', () => ({
  useSkillCategories: () => [
    { key: 'plumber', en: 'Plumber', ur: 'پلمبر', icon: 1, templateCategory: 'plumbing' },
    { key: 'electrician', en: 'Electrician', ur: 'الیکٹریشن', icon: 1, templateCategory: 'electrical' },
    { key: 'painter', en: 'Painter', ur: 'پینٹر', icon: 1, templateCategory: 'painting' },
  ],
}));
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { categories: mockCats.current }, error: null }) }) }),
    }),
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

beforeEach(() => {
  mockRpc.mockReset();
  mockCats.current = ['plumber'];
});

const pressed = (u: ReturnType<typeof render>, label: string) =>
  u.getByText(label).parent?.parent?.props?.accessibilityState?.selected;

describe('TradesSetting', () => {
  it('shows every trade and marks the ones the worker already has', async () => {
    const u = render(<TradesSetting />);
    await waitFor(() => expect(pressed(u, 'Plumber')).toBe(true));
    expect(pressed(u, 'Electrician')).toBe(false);
    expect(u.getByText('My trades')).toBeTruthy();
  });

  it('keeps Save off until something changes', async () => {
    const u = render(<TradesSetting />);
    await waitFor(() => expect(pressed(u, 'Plumber')).toBe(true));
    fireEvent.press(u.getByText('Save my trades'));
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('adds a second trade and saves both', async () => {
    mockRpc.mockResolvedValue({ data: ['plumber', 'electrician'], error: null });
    const onSaved = jest.fn();
    const u = render(<TradesSetting onSaved={onSaved} />);
    await waitFor(() => expect(pressed(u, 'Plumber')).toBe(true));
    fireEvent.press(u.getByText('Electrician'));
    fireEvent.press(u.getByText('Save my trades'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('worker_set_trades', { p_categories: ['plumber', 'electrician'] }));
    expect(await u.findByText('Trades saved. You can now add services for each.')).toBeTruthy();
    expect(onSaved).toHaveBeenCalledWith(['plumber', 'electrician']);
  });

  it('will not save with no trade picked', async () => {
    const u = render(<TradesSetting />);
    await waitFor(() => expect(pressed(u, 'Plumber')).toBe(true));
    fireEvent.press(u.getByText('Plumber'));
    fireEvent.press(u.getByText('Save my trades'));
    expect(await u.findByText('Keep at least one trade.')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('shows the server message when saving fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'unknown trade' } });
    const u = render(<TradesSetting />);
    await waitFor(() => expect(pressed(u, 'Plumber')).toBe(true));
    fireEvent.press(u.getByText('Painter'));
    fireEvent.press(u.getByText('Save my trades'));
    expect(await u.findByText('unknown trade')).toBeTruthy();
  });
});
