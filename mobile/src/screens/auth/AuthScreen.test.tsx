import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AuthScreen from './AuthScreen';

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockGoBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ signIn: mockSignIn, signUp: mockSignUp }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, canGoBack: mockCanGoBack }),
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
  mockSignUp.mockReset();
  mockGoBack.mockReset();
  mockCanGoBack.mockReset();
  mockCanGoBack.mockReturnValue(true);
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

  it('shows the check-email banner when signup requires confirmation and does not goBack', async () => {
    mockSignUp.mockResolvedValueOnce({ requiresConfirmation: true });
    const { getByText } = wrap(<AuthScreen />);
    await act(async () => {
      fireEvent.press(getByText('Create account'));
    });
    await waitFor(() => expect(mockSignUp).toHaveBeenCalledTimes(1));
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(getByText('Account created. Check your email to confirm, then sign in.')).toBeTruthy();
  });

  it('pops back when signup returns a session (no confirmation needed)', async () => {
    mockSignUp.mockResolvedValueOnce({ requiresConfirmation: false });
    const { getByText } = wrap(<AuthScreen />);
    await act(async () => {
      fireEvent.press(getByText('Create account'));
    });
    await waitFor(() => expect(mockSignUp).toHaveBeenCalledTimes(1));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
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
