import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AuthScreen from './AuthScreen';

const mockSignIn = jest.fn();
const mockGoBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockNavigate = jest.fn();

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ signIn: mockSignIn }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, canGoBack: mockCanGoBack, navigate: mockNavigate }),
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
  mockSignIn.mockReset();
  mockGoBack.mockReset();
  mockCanGoBack.mockReset();
  mockCanGoBack.mockReturnValue(true);
  mockNavigate.mockReset();
});

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

  it('pops back on successful sign in', async () => {
    mockSignIn.mockResolvedValueOnce(undefined);
    const { getByText } = wrap(<AuthScreen />);
    await act(async () => {
      fireEvent.press(getByText('Sign in'));
    });
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('navigates to the register choice screen on "Create account"', async () => {
    const { getByText } = wrap(<AuthScreen />);
    await act(async () => {
      fireEvent.press(getByText('Create account'));
    });
    expect(mockNavigate).toHaveBeenCalledWith('RegisterChoice');
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('shows an error message when signin fails', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('Invalid credentials'));
    const { getByText } = wrap(<AuthScreen />);
    await act(async () => {
      fireEvent.press(getByText('Sign in'));
    });
    await waitFor(() => expect(getByText('Invalid credentials')).toBeTruthy());
    expect(mockGoBack).not.toHaveBeenCalled();
  });
});
