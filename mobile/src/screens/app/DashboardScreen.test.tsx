import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DashboardScreen from './DashboardScreen';

const mockNavigate = jest.fn();

const mockAuth: { current: { role: 'customer' | 'worker' | null; session: { user: { id: string } } | null } } = {
  current: { role: 'customer', session: null },
};

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuth.current,
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const wrap = (node: React.ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      {node}
    </SafeAreaProvider>,
  );

beforeEach(() => {
  mockNavigate.mockReset();
  mockAuth.current = { role: 'customer', session: null };
});

describe('DashboardScreen', () => {
  it('renders the bilingual hero', () => {
    const { getByText } = wrap(<DashboardScreen />);
    expect(getByText('Get free quotes from local skilled workers')).toBeTruthy();
    expect(getByText('مقامی ہنر مند کارکنوں سے مفت تخمینے حاصل کریں')).toBeTruthy();
    expect(getByText('How it works')).toBeTruthy();
    expect(getByText('Popular categories')).toBeTruthy();
  });

  it('matches snapshot', () => {
    const tree = wrap(<DashboardScreen />).toJSON();
    expect(tree).toMatchSnapshot();
  });

  it('routes the guest "Browse services" CTA to the Services tab', () => {
    mockAuth.current = { role: null, session: null };
    const { getByText } = wrap(<DashboardScreen />);
    fireEvent.press(getByText('Browse services'));
    expect(mockNavigate).toHaveBeenCalledWith('Services');
  });

  it('routes the guest "Post a job" CTA to the Jobs tab (no NAVIGATE error)', () => {
    mockAuth.current = { role: null, session: null };
    const { getByText } = wrap(<DashboardScreen />);
    fireEvent.press(getByText('Post a job'));
    expect(mockNavigate).toHaveBeenCalledWith('Jobs');
  });
});
