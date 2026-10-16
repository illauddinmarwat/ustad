import { AppState } from 'react-native';

/**
 * Wraps a poll callback so it only runs while the app is in the foreground. Backgrounded phones keep
 * timers alive for a while, and every idle tick is a request the server has to answer for nobody.
 * Each hook already refreshes when the app returns to the foreground, so nothing is missed.
 */
export function activeOnly<T extends unknown[]>(fn: (...args: T) => void): (...args: T) => void {
  return (...args: T) => {
    if (AppState.currentState === 'active') fn(...args);
  };
}
