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
  it('renders the bilingual brand header and categories', () => {
    const { getByText } = wrap(<DashboardScreen />);
    expect(getByText('Ustad')).toBeTruthy();
    expect(getByText('استاد')).toBeTruthy();
    expect(getByText('Your skill, your livelihood')).toBeTruthy();
    expect(getByText('Popular categories')).toBeTruthy();
    expect(getByText('Electrician')).toBeTruthy();
    expect(getByText('Welder')).toBeTruthy();
  });

  it('matches snapshot', () => {
    const tree = wrap(<DashboardScreen />).toJSON();
    expect(tree).toMatchSnapshot();
  });

  it('routes the guest "Register as Professional" CTA to the professional registration form', () => {
    mockAuth.current = { role: null, session: null };
    const { getByText } = wrap(<DashboardScreen />);
    fireEvent.press(getByText('Register as Professional'));
    expect(mockNavigate).toHaveBeenCalledWith('RegisterProfessional');
  });

  it('routes the guest "Register as Customer" CTA to the customer registration form', () => {
    mockAuth.current = { role: null, session: null };
    const { getByText } = wrap(<DashboardScreen />);
    fireEvent.press(getByText('Register as Customer'));
    expect(mockNavigate).toHaveBeenCalledWith('RegisterCustomer');
  });

  it('routes the signed-in customer "Browse services" CTA to the Services tab', () => {
    mockAuth.current = { role: 'customer', session: { user: { id: 'u1' } } };
    const { getByText } = wrap(<DashboardScreen />);
    fireEvent.press(getByText('Browse services'));
    expect(mockNavigate).toHaveBeenCalledWith('Services');
  });

  it('routes the signed-in customer "Find nearby Ustads" CTA to the Nearby tab', () => {
    mockAuth.current = { role: 'customer', session: { user: { id: 'u1' } } };
    const { getByText } = wrap(<DashboardScreen />);
    fireEvent.press(getByText('Find nearby Ustads'));
    expect(mockNavigate).toHaveBeenCalledWith('Nearby');
  });
});
