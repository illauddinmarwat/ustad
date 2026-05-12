import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DashboardScreen from './DashboardScreen';

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ role: 'customer', session: null }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
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
});
