import React from 'react';
import { act, render } from '@testing-library/react-native';

import { QuotePricePreview } from './QuotePricePreview';

const mockRpc = jest.fn();
jest.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

beforeEach(() => {
  jest.useFakeTimers();
  mockRpc.mockReset();
});
afterEach(() => jest.useRealTimers());

const settle = async () => {
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
};

describe('QuotePricePreview', () => {
  it('shows what the customer sees, the fee and what the Ustad keeps', async () => {
    mockRpc.mockResolvedValue({ data: [{ customer_price: 115, commission: 15, commission_pct: 15 }], error: null });
    const { getByText, getByTestId } = render(<QuotePricePreview amount="100" />);
    await settle();
    expect(mockRpc).toHaveBeenCalledWith('quote_price_preview', { p_amount_pkr: 100 });
    expect(getByTestId('quote-price-preview')).toBeTruthy();
    expect(getByText('Customer will see')).toBeTruthy();
    expect(getByText('Rs 115')).toBeTruthy();
    expect(getByText('Rs 15')).toBeTruthy();
    expect(getByText('Rs 100')).toBeTruthy();
  });

  it('renders nothing when the markup is off', async () => {
    mockRpc.mockResolvedValue({ data: [{ customer_price: 100, commission: 0, commission_pct: 0 }], error: null });
    const { queryByTestId } = render(<QuotePricePreview amount="100" />);
    await settle();
    expect(queryByTestId('quote-price-preview')).toBeNull();
  });

  it('does not call the server for an empty or invalid amount', async () => {
    const { queryByTestId, rerender } = render(<QuotePricePreview amount="" />);
    await settle();
    rerender(<QuotePricePreview amount="abc" />);
    await settle();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(queryByTestId('quote-price-preview')).toBeNull();
  });

  it('renders nothing if the server call fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'approved workers only' } });
    const { queryByTestId } = render(<QuotePricePreview amount="100" />);
    await settle();
    expect(queryByTestId('quote-price-preview')).toBeNull();
  });
});
