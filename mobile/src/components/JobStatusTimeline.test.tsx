import React from 'react';
import { render } from '@testing-library/react-native';

import { JobStatusTimeline } from './JobStatusTimeline';

const base = { status: 'assigned', origin: 'customer_job', workerDone: false, hasQuote: true, enRoute: false, showEnRoute: false };

describe('JobStatusTimeline', () => {
  it('shows every step in English and Urdu, and what happens next for the customer', () => {
    const u = render(<JobStatusTimeline {...base} viewer="customer" />);
    expect(u.getByText('Where this job is')).toBeTruthy();
    expect(u.getByText('Job posted')).toBeTruthy();
    expect(u.getByText('کام پوسٹ ہوا')).toBeTruthy();
    expect(u.getByText('Ustad says work is done')).toBeTruthy();
    expect(u.getByText('The Ustad will do the work and tell you when it is done.')).toBeTruthy();
  });

  it('tells the Ustad what to do next, differently', () => {
    const u = render(<JobStatusTimeline {...base} viewer="worker" workerDone />);
    expect(u.getByText(/Wait for the customer to confirm/)).toBeTruthy();
  });

  it('shows a cancelled job as cancelled', () => {
    const u = render(<JobStatusTimeline {...base} status="cancelled" viewer="customer" />);
    expect(u.getByText('Job cancelled')).toBeTruthy();
    expect(u.queryByText('Ustad sent a price')).toBeNull();
  });
});
