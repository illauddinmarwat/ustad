import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import WorkerHomeScreen from './WorkerHomeScreen';

jest.mock('../../lib/supabase', () => ({ supabase: {} }));

const mockNavigate = jest.fn();
const mockToggle = jest.fn();

jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'w1' } }, role: 'worker' }) }));
jest.mock('../../lib/jobPosting', () => ({ fetchJobPostingEnabled: () => Promise.resolve(false) }));
jest.mock('../../lib/useUnreadNotifications', () => ({ useUnreadNotifications: () => ({ count: 0, refresh: jest.fn() }) }));
jest.mock('../../lib/workerStats', () => ({
  useWorkerAvailability: () => ({ available: true, toggle: mockToggle }),
  useWorkerEarnings: () => ({ entries: [], loaded: true, summary: { weekJobs: 4 } }),
}));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

const wrap = (node: React.ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      {node}
    </SafeAreaProvider>,
  );

beforeEach(() => {
  mockNavigate.mockReset();
  mockToggle.mockReset();
});

describe('WorkerHomeScreen', () => {
  it('shows availability and this week\'s job count', () => {
    const { getByText } = wrap(<WorkerHomeScreen />);
    expect(getByText('Ready for work?')).toBeTruthy();
    expect(getByText('Available for jobs')).toBeTruthy();
    expect(getByText('4')).toBeTruthy();
  });

  it('toggles availability through the hook', () => {
    const { getByLabelText } = wrap(<WorkerHomeScreen />);
    fireEvent(getByLabelText('Availability'), 'valueChange', false);
    expect(mockToggle).toHaveBeenCalledWith(false);
  });

  it('opens the inbox tab', () => {
    const { getByText } = wrap(<WorkerHomeScreen />);
    fireEvent.press(getByText('Applications & messages'));
    expect(mockNavigate).toHaveBeenCalledWith('Applications');
  });
});
