import { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useFixtureMode } from '../config/env';
import { FIXTURE_CUSTOMER_ID, FIXTURE_WORKER_ID } from '../dev/fixtures';
import { supabase } from '../lib/supabase';

type AuthCtx = {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  previewRole: 'customer' | 'worker';
  setPreviewRole: (r: 'customer' | 'worker') => void;
};

const Ctx = createContext<AuthCtx | null>(null);

function buildFixtureSession(role: 'customer' | 'worker'): Session {
  const id = role === 'customer' ? FIXTURE_CUSTOMER_ID : FIXTURE_WORKER_ID;
  return {
    access_token: 'fixture-token',
    refresh_token: 'fixture-refresh',
    expires_in: 999999999,
    token_type: 'bearer',
    user: {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: role === 'customer' ? 'customer@fixture.local' : 'worker@fixture.local',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  } as unknown as Session;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => !useFixtureMode);
  const [previewRole, setPreviewRole] = useState<'customer' | 'worker'>('customer');

  useEffect(() => {
    if (useFixtureMode) {
      setSession(buildFixtureSession(previewRole));
      setLoading(false);
      return;
    }

    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        if (!cancelled) {
          setSession(s);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [useFixtureMode]);

  useEffect(() => {
    if (useFixtureMode) {
      setSession(buildFixtureSession(previewRole));
    }
  }, [previewRole, useFixtureMode]);

  const signOut = async () => {
    if (useFixtureMode) {
      setPreviewRole('customer');
      setSession(buildFixtureSession('customer'));
      return;
    }
    await supabase.auth.signOut();
  };

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      loading,
      signOut,
      previewRole,
      setPreviewRole,
    }),
    [session, loading, signOut, previewRole]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
