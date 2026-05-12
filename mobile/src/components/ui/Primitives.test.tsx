import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { AppCard, PrimaryButton, SectionHeader, StatusPill } from './Primitives';

describe('UI primitives (Phase 2)', () => {
  it('renders section header text', () => {
    const { getByText } = render(<SectionHeader title="Jobs" subtitle="Recent activity" />);
    expect(getByText('Jobs')).toBeTruthy();
    expect(getByText('Recent activity')).toBeTruthy();
  });

  it('invokes onPress for primary button', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<PrimaryButton label="Continue" onPress={onPress} />);
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders status pill and card children', () => {
    const { getByText } = render(
      <AppCard>
        <StatusPill label="assigned" />
      </AppCard>
    );
    expect(getByText('assigned')).toBeTruthy();
  });
});
