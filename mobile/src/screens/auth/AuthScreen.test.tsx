import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AuthScreen from './AuthScreen';

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ signIn: jest.fn(), signUp: jest.fn() }),
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

describe('AuthScreen', () => {
  it('renders welcome copy in EN and UR', () => {
    const { getByText } = wrap(<AuthScreen />);
    expect(getByText('Welcome back')).toBeTruthy();
    expect(getByText('خوش آمدید')).toBeTruthy();
  });

  it('matches snapshot', () => {
    const tree = wrap(<AuthScreen />).toJSON();
    expect(tree).toMatchSnapshot();
  });
});
