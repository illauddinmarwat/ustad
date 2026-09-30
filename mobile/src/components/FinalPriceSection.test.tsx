import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { TextInput } from 'react-native';

import { FinalPriceSection } from './FinalPriceSection';

const mockRpc = jest.fn();
jest.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

type Row = { is_estimate: boolean; status: string; amount_pkr: number | null; customer_price_pkr: number | null; attempts: number; viewer: string };

const serve = (row: Row | null, extra: Record<string, unknown> = {}) =>
  mockRpc.mockImplementation((name: string) => {
    if (name in extra) return Promise.resolve(extra[name]);
    if (name === 'job_final_price') return Promise.resolve({ data: row ? [row] : [], error: null });
    return Promise.resolve({ data: null, error: null });
  });

const customerRow = (status: string, amount: number | null = 230): Row => ({
  is_estimate: true, status, amount_pkr: amount, customer_price_pkr: amount, attempts: 1, viewer: 'customer',
});
const workerRow = (status: string, own: number | null = 200, customer: number | null = 230): Row => ({
  is_estimate: true, status, amount_pkr: own, customer_price_pkr: customer, attempts: 1, viewer: 'worker',
});

beforeEach(() => mockRpc.mockReset());

describe('FinalPriceSection', () => {
  it('renders nothing for a fixed-price job', async () => {
    serve({ ...customerRow('none'), is_estimate: false });
    const u = render(<FinalPriceSection jobId="j1" status="assigned" isCustomer isWorker={false} />);
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(u.queryByText('Final price')).toBeNull();
  });

  it('tells the customer to wait before a price is proposed', async () => {
    serve(customerRow('none', null));
    const u = render(<FinalPriceSection jobId="j1" status="assigned" isCustomer isWorker={false} />);
    expect(await u.findByText(/will set the final price after inspecting/)).toBeTruthy();
  });

  it('lets the customer accept a proposed price', async () => {
    serve(customerRow('proposed'));
    const onChanged = jest.fn();
    const u = render(<FinalPriceSection jobId="j1" status="assigned" isCustomer isWorker={false} onChanged={onChanged} />);
    expect(await u.findByText('Rs 230')).toBeTruthy();
    fireEvent.press(u.getByText('Accept price'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('customer_respond_final_price', { p_job_id: 'j1', p_accept: true }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('lets the customer decline', async () => {
    serve(customerRow('proposed'));
    const u = render(<FinalPriceSection jobId="j1" status="assigned" isCustomer isWorker={false} />);
    fireEvent.press(await u.findByText('Decline'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('customer_respond_final_price', { p_job_id: 'j1', p_accept: false }));
  });

  it('shows the agreed price and passes the customer price up for the payment step', async () => {
    serve(customerRow('confirmed', 207));
    const onAgreed = jest.fn();
    const u = render(<FinalPriceSection jobId="j1" status="completed" isCustomer isWorker={false} onAgreed={onAgreed} />);
    expect(await u.findByText('Agreed final price: Rs 207')).toBeTruthy();
    expect(onAgreed).toHaveBeenLastCalledWith(207);
  });

  it('gives the worker the customer price for payment while showing their own price', async () => {
    serve(workerRow('confirmed', 180, 207));
    const onAgreed = jest.fn();
    const u = render(<FinalPriceSection jobId="j1" status="completed" isCustomer={false} isWorker onAgreed={onAgreed} />);
    expect(await u.findByText('Agreed final price: Rs 207')).toBeTruthy();
    expect(onAgreed).toHaveBeenLastCalledWith(207);
  });

  it('lets the worker send a final price after inspecting', async () => {
    serve(workerRow('none', null, null));
    const u = render(<FinalPriceSection jobId="j1" status="assigned" isCustomer={false} isWorker />);
    await u.findByText('Send final price');
    fireEvent.changeText(u.UNSAFE_getAllByType(TextInput)[0], '200');
    fireEvent.press(u.getByText('Send final price'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('worker_set_final_price', { p_job_id: 'j1', p_amount_pkr: 200 }));
  });

  it('rejects an empty amount without calling the server', async () => {
    serve(workerRow('none', null, null));
    const u = render(<FinalPriceSection jobId="j1" status="assigned" isCustomer={false} isWorker />);
    fireEvent.press(await u.findByText('Send final price'));
    expect(await u.findByText('Enter a valid amount.')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalledWith('worker_set_final_price', expect.anything());
  });

  it('shows the worker a waiting message while the customer decides, and the server error if a send fails', async () => {
    serve(workerRow('proposed'));
    const u = render(<FinalPriceSection jobId="j1" status="assigned" isCustomer={false} isWorker />);
    expect(await u.findByText('Waiting for the customer to accept your price.')).toBeTruthy();
  });

  it('shows the server message when sending fails', async () => {
    serve(workerRow('declined', 200, 230), { worker_set_final_price: { data: null, error: { message: 'too many proposals; please call the helpline' } } });
    const u = render(<FinalPriceSection jobId="j1" status="assigned" isCustomer={false} isWorker />);
    await u.findByText('Send final price');
    fireEvent.changeText(u.UNSAFE_getAllByType(TextInput)[0], '190');
    fireEvent.press(u.getByText('Send final price'));
    expect(await u.findByText('too many proposals; please call the helpline')).toBeTruthy();
  });
});
