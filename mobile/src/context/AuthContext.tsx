import { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useFixtureMode } from '../config/env';
import { FIXTURE_CUSTOMER_ID, FIXTURE_WORKER_ID } from '../dev/fixtures';
import { supabase } from '../lib/supabase';
import { unregisterPush } from '../lib/notifications';

export type SignUpResult = { requiresConfirmation: boolean };

type WorkerApprovalStatus = 'pending' | 'approved' | 'rejected';

type AuthCtx = {
  session: Session | null;
  loading: boolean;
  role: 'customer' | 'worker' | 'admin' | null;
  workerApprovalStatus: WorkerApprovalStatus | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  setRole: (r: 'customer' | 'worker') => Promise<void>;
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
  const [role, setRoleState] = useState<'customer' | 'worker' | 'admin' | null>(null);
  const [workerApprovalStatus, setWorkerApprovalStatus] = useState<WorkerApprovalStatus | null>(null);

  const applyRoleForUser = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
    const resolvedRole = (data?.role as 'customer' | 'worker' | 'admin') ?? 'customer';
    setRoleState(resolvedRole);
    if (resolvedRole === 'worker') {
      const { data: wp } = await supabase
        .from('worker_profiles')
        .select('approval_status')
        .eq('user_id', userId)
        .maybeSingle();
      setWorkerApprovalStatus((wp?.approval_status as WorkerApprovalStatus) ?? null);
    } else {
      setWorkerApprovalStatus(null);
    }
  };

  useEffect(() => {
    if (useFixtureMode) {
      setSession(buildFixtureSession(previewRole));
      setRoleState(previewRole);
      setWorkerApprovalStatus(previewRole === 'worker' ? 'approved' : null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    supabase.auth
      .getSession()
      .then(async ({ data: { session: s } }) => {
        if (cancelled) return;
        try {
          setSession(s);
          if (s?.user?.id) {
            await applyRoleForUser(s.user.id);
          } else if (!cancelled) {
            setRoleState(null);
            setWorkerApprovalStatus(null);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      if (!s?.user?.id) {
        setRoleState(null);
        setWorkerApprovalStatus(null);
        return;
      }
      await applyRoleForUser(s.user.id);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [useFixtureMode]);

  useEffect(() => {
    if (useFixtureMode) {
      setSession(buildFixtureSession(previewRole));
      setRoleState(previewRole);
      setWorkerApprovalStatus(previewRole === 'worker' ? 'approved' : null);
    }
  }, [previewRole, useFixtureMode]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return { requiresConfirmation: !data.session };
  };

  const signOut = async () => {
    if (useFixtureMode) {
      setPreviewRole('customer');
      setSession(buildFixtureSession('customer'));
      return;
    }
    let signOutError: unknown = null;
    // Must run while still signed in: removing the token needs the user's session.
    await unregisterPush();
    try {
      // `scope: 'local'` always clears local storage even if the server-side
      // `/logout` call fails (revoked JWT, network blip, etc.). We never want
      // a logout tap to leave the UI authenticated.
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) signOutError = error;
    } catch (e) {
      signOutError = e;
    }
    // Force-clear React state so the UI flips to guest immediately, regardless
    // of whether `onAuthStateChange` fires.
    setSession(null);
    setRoleState(null);
    setWorkerApprovalStatus(null);
    if (signOutError) throw signOutError;
  };

  const setRole = async (r: 'customer' | 'worker') => {
    if (!session?.user?.id) return;
    const { error } = await supabase.from('profiles').update({ role: r }).eq('id', session.user.id);
    if (error) throw error;
    setRoleState(r);
    if (r === 'worker') await applyRoleForUser(session.user.id);
    else setWorkerApprovalStatus(null);
  };

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      loading,
      role,
      workerApprovalStatus,
      signIn,
      signUp,
      signOut,
      setRole,
    }),
    [session, loading, role, workerApprovalStatus]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
