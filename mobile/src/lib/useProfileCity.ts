import { useEffect, useState } from 'react';

import { supabase } from './supabase';

/** The city saved on the signed-in person's profile, to start a place picker on. Null for a guest or when none is saved. */
export function useProfileCity(userId: string | null | undefined): string | null {
  const [city, setCity] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) {
      setCity(null);
      return;
    }
    let live = true;
    void (async () => {
      const { data } = await supabase.from('profiles').select('city').eq('id', userId).maybeSingle();
      if (live) setCity(((data as { city?: string | null } | null)?.city ?? null) || null);
    })();
    return () => {
      live = false;
    };
  }, [userId]);
  return city;
}
