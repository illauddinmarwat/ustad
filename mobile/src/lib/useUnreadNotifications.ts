import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { fetchUnreadCount } from './notifications';

const POLL_MS = 30_000;

/** Unread notification count for a user; refreshes on a timer and when the app returns to the foreground. */
export function useUnreadNotifications(userId: string | null | undefined): { count: number; refresh: () => void } {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (!userId) {
      setCount(0);
      return;
    }
    fetchUnreadCount(userId)
      .then(setCount)
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    refresh();
    if (!userId) return;
    const timer = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [userId, refresh]);

  return { count, refresh };
}
