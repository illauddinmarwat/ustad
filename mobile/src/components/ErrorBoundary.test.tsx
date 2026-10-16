import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ErrorBoundary } from './ErrorBoundary';

const mockReport = jest.fn();
jest.mock('../lib/crashReporter', () => ({ reportError: (...a: unknown[]) => mockReport(...a) }));

let shouldThrow = true;
function Bomb() {
  if (shouldThrow) throw new Error('boom');
  return <Text>all good</Text>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = true;
    mockReport.mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('shows a recovery screen instead of crashing, and recovers on retry', () => {
    const { getByText, queryByText } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(getByText('Something went wrong')).toBeTruthy();
    expect(queryByText('all good')).toBeNull();
    expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }), expect.objectContaining({ fatal: true }));

    shouldThrow = false;
    fireEvent.press(getByText('Try again'));
    expect(getByText('all good')).toBeTruthy();
  });

  it('renders children untouched when nothing fails', () => {
    shouldThrow = false;
    const { getByText } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(getByText('all good')).toBeTruthy();
  });
});
