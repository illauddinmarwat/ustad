import { useEffect } from 'react';
import { AppState } from 'react-native';

import { getMyLocation } from './myLocation';
import { supabase } from './supabase';

const REFRESH_MS = 30 * 60_000;

/**
 * Keeps a signed-in Ustad findable: on start, and whenever the app comes back after a while, their current position
 * is saved to their profile. There is no button for it; if the phone's permission is refused, nothing happens.
 */
export function useAutoShareLocation(userId: string | null | undefined, role: string | null | undefined): void {
  useEffect(() => {
    if (!userId || role !== 'worker') return;
    let lastAt = 0;
    let busy = false;
    const share = async () => {
      if (busy || Date.now() - lastAt < REFRESH_MS) return;
      busy = true;
      try {
        const pos = await getMyLocation();
        if (!pos) return;
        lastAt = Date.now();
        await supabase
          .from('worker_profiles')
          .update({ lat: pos.lat, lng: pos.lng, location_updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      } finally {
        busy = false;
      }
    };
    void share();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void share();
    });
    return () => sub.remove();
  }, [userId, role]);
}
