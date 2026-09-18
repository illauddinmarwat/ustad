'use client';

import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from './supabaseClient';

export type AdminAuthState = {
  loading: boolean;
  session: Session | null;
  isAdmin: boolean;
  displayName: string | null;
};

export function useAdminAuth(): AdminAuthState & { signOut: () => Promise<void> } {
  const [state, setState] = useState<AdminAuthState>({
    loading: true,
    session: null,
    isAdmin: false,
    displayName: null,
  });

  useEffect(() => {
    let cancelled = false;

    const resolveRole = async (session: Session | null) => {
      if (!session?.user?.id) {
        if (!cancelled) setState({ loading: false, session: null, isAdmin: false, displayName: null });
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('role,display_name')
        .eq('id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      setState({
        loading: false,
        session,
        isAdmin: data?.role === 'admin',
        displayName: data?.display_name ?? session.user.email ?? null,
      });
    };

    supabase.auth.getSession().then(({ data: { session } }) => resolveRole(session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((prev) => ({ ...prev, loading: true }));
      resolveRole(session);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { ...state, signOut };
}
