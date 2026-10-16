import { AppState } from 'react-native';

import { activeOnly } from './activeOnly';

describe('activeOnly', () => {
  const setState = (s: string) => Object.defineProperty(AppState, 'currentState', { value: s, configurable: true });

  afterEach(() => setState('active'));

  it('runs the callback with its arguments while the app is in the foreground', () => {
    setState('active');
    const fn = jest.fn();
    activeOnly(fn)(1, 'a');
    expect(fn).toHaveBeenCalledWith(1, 'a');
  });

  it('skips the callback while the app is in the background', () => {
    setState('background');
    const fn = jest.fn();
    activeOnly(fn)();
    expect(fn).not.toHaveBeenCalled();
  });
});
