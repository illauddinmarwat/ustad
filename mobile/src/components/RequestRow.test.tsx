import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { RequestRow, type RequestJob } from './RequestRow';

jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn(() => Promise.resolve({ data: [], error: null })) } }));

const job: RequestJob = {
  id: 'j1', title: 'Fix tap', description: 'Leaking', status: 'open', budget_pkr: 2000, preferred_time: null,
  location_text: null, target_worker_id: 'w1', worker_id: null, customer_id: 'c1',
};

const noop = () => undefined;
const props = {
  job, mode: 'worker' as const, counterpart: 'Ali', quotes: [],
  onAcceptBudget: noop, onQuote: noop, onDecline: noop, onAcceptQuote: noop, onCancel: noop, onView: noop,
};

describe('RequestRow with the quote commission markup', () => {
  it('still offers "Accept budget" and the budget chip while the markup is off', () => {
    const { getByText } = render(<RequestRow {...props} />);
    expect(getByText('Accept budget')).toBeTruthy();
    expect(getByText('Rs 2000')).toBeTruthy();
  });

  it('hides "Accept budget" and the budget chip when the markup is on', () => {
    const { queryByText } = render(<RequestRow {...props} quoteMarkup />);
    expect(queryByText('Accept budget')).toBeNull();
    expect(queryByText('Rs 2000')).toBeNull();
  });

  it('labels the price field as what the worker earns', () => {
    const { getByText } = render(<RequestRow {...props} quoteMarkup />);
    expect(getByText('Your price in Rs (what you earn)')).toBeTruthy();
  });

  it('shows the customer only the quoted price', () => {
    const { getByText, queryByText } = render(
      <RequestRow {...props} mode="customer" quoteMarkup quotes={[{ id: 'q1', job_id: 'j1', amount_pkr: 230, message: null, status: 'pending' }]} />,
    );
    expect(getByText('Rs 230')).toBeTruthy();
    expect(queryByText(/fee|commission/i)).toBeNull();
  });
});

describe('RequestRow details for the Ustad', () => {
  it('lets the Ustad open the request to see the photos, video and voice note', () => {
    const onView = jest.fn();
    const { getByText } = render(<RequestRow {...props} quoteMarkup onView={onView} />);
    fireEvent.press(getByText('View photos and details'));
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it('does not show that button to the customer', () => {
    const { queryByText } = render(<RequestRow {...props} mode="customer" />);
    expect(queryByText('View photos and details')).toBeNull();
  });
});
