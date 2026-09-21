import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { JobContactSection } from './JobContactSection';
import { JobPaymentSection } from './JobPaymentSection';

const mockRpc = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { value: 'Coming soon' } }) }) }),
    }),
  },
}));

beforeEach(() => {
  mockRpc.mockReset();
});

describe('JobPaymentSection', () => {
  it('lets the customer mark a completed job as paid in cash', async () => {
    mockRpc.mockResolvedValue({ data: 'pay-1', error: null });
    const onChanged = jest.fn();
    const { getByText, getByDisplayValue } = render(
      <JobPaymentSection jobId="j1" status="completed" isCustomer isWorker={false} suggestedAmount={1500} onChanged={onChanged} />,
    );
    expect(getByDisplayValue('1500')).toBeTruthy();
    fireEvent.press(getByText('I have paid'));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('mark_job_paid', { p_job_id: 'j1', p_amount: 1500, p_method: 'cash', p_note: null }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('rejects an empty amount without calling the server', () => {
    const { getByText } = render(<JobPaymentSection jobId="j1" status="completed" isCustomer isWorker={false} />);
    fireEvent.press(getByText('I have paid'));
    expect(mockRpc).not.toHaveBeenCalled();
    expect(getByText('Enter a valid amount')).toBeTruthy();
  });

  it('lets the worker confirm the amount received', async () => {
    mockRpc.mockResolvedValue({ data: 'closed', error: null });
    const { getByText } = render(
      <JobPaymentSection jobId="j1" status="payment_pending" isCustomer={false} isWorker suggestedAmount={1500} />,
    );
    fireEvent.press(getByText('I received the payment'));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('worker_confirm_payment_received', { p_job_id: 'j1', p_received_amount: 1500 }),
    );
  });

  it('tells the worker to call the helpline when amounts differ', async () => {
    mockRpc.mockResolvedValue({ data: 'disputed', error: null });
    const { getByText, findByText } = render(
      <JobPaymentSection jobId="j1" status="payment_pending" isCustomer={false} isWorker suggestedAmount={1000} />,
    );
    fireEvent.press(getByText('I received the payment'));
    expect(await findByText(/amounts do not match/i)).toBeTruthy();
  });

  it('shows waiting states and the closed state', () => {
    const wait = render(<JobPaymentSection jobId="j1" status="payment_pending" isCustomer isWorker={false} />);
    expect(wait.getByText(/Waiting for the worker to confirm/)).toBeTruthy();
    const closed = render(<JobPaymentSection jobId="j1" status="closed" isCustomer isWorker={false} />);
    expect(closed.getByText(/This job is closed/)).toBeTruthy();
  });

  it('renders nothing before the work is completed', () => {
    const { toJSON } = render(<JobPaymentSection jobId="j1" status="assigned" isCustomer isWorker={false} />);
    expect(toJSON()).toBeNull();
  });
});

describe('JobContactSection', () => {
  it('renders nothing before a worker has accepted', () => {
    const { toJSON } = render(<JobContactSection jobId="j1" status="open" isCustomer isWorker={false} />);
    expect(toJSON()).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('asks the customer for phone and address after acceptance and saves them', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_job_contacts') {
        return Promise.resolve({ data: [{ worker_phone: '0300-1111111', customer_phone: null, customer_address: null, contact_shared: false }] });
      }
      if (name === 'get_my_contact_defaults') return Promise.resolve({ data: [{ phone: '0321-2223334', address: 'House 4, Street 2, DHA' }] });
      return Promise.resolve({ data: null, error: null });
    });
    const { findByText, getByText } = render(<JobContactSection jobId="j1" status="assigned" isCustomer isWorker={false} />);
    expect(await findByText('0300-1111111')).toBeTruthy();
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('get_my_contact_defaults'));
    fireEvent.press(getByText('Share with worker'));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('customer_set_job_contact', {
        p_job_id: 'j1',
        p_phone: '0321-2223334',
        p_address: 'House 4, Street 2, DHA',
      }),
    );
  });

  it('shows the worker a waiting message until the customer shares details', async () => {
    mockRpc.mockResolvedValue({ data: [{ worker_phone: null, customer_phone: null, customer_address: null, contact_shared: false }] });
    const { findByText } = render(<JobContactSection jobId="j1" status="assigned" isCustomer={false} isWorker />);
    expect(await findByText(/Waiting for the customer to share/)).toBeTruthy();
  });

  it('shows the worker the customer contact once shared', async () => {
    mockRpc.mockResolvedValue({
      data: [{ worker_phone: null, customer_phone: '0300-9998887', customer_address: 'Flat 5, Gulshan', contact_shared: true }],
    });
    const { findByText } = render(<JobContactSection jobId="j1" status="assigned" isCustomer={false} isWorker />);
    expect(await findByText('0300-9998887')).toBeTruthy();
    expect(await findByText('Flat 5, Gulshan')).toBeTruthy();
  });
});
