import { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { getLocales } from 'expo-localization';

import { useFixtureMode } from '../config/env';
import { FIXTURE_CUSTOMER_ID, FIXTURE_WORKER_ID } from '../dev/fixtures';
import { supabase } from '../lib/supabase';
import { unregisterPush } from '../lib/notifications';
import { flushPendingUploads } from '../lib/workerUploads';

export type AppLanguage = 'en' | 'ur';

/** Guests have no profile, so the phone's language decides. */
function deviceLanguage(): AppLanguage {
  try {
    return getLocales()[0]?.languageCode === 'ur' ? 'ur' : 'en';
  } catch {
    return 'en';
  }
}

export type SignUpResult = { requiresConfirmation: boolean };

type WorkerApprovalStatus = 'pending' | 'approved' | 'rejected';

type AuthCtx = {
  session: Session | null;
  loading: boolean;
  role: 'customer' | 'worker' | 'admin' | null;
  workerApprovalStatus: WorkerApprovalStatus | null;
  /** The language the person reads posts in (`profiles.preferred_language`). */
  language: AppLanguage;
  setLanguage: (l: AppLanguage) => Promise<void>;
  /** The admin's remark when the registration was rejected. */
  rejectionReason: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  /** Re-reads the approval status; resolves to the latest value (null when it could not be read). */
  refreshApproval: () => Promise<WorkerApprovalStatus | null>;
  /** True while an Ustad registration is being submitted, so the approval lock does not flash over the form. */
  registering: boolean;
  setRegistering: (v: boolean) => void;
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
  const [registering, setRegistering] = useState(false);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [language, setLanguageState] = useState<AppLanguage>(deviceLanguage);

  const applyRoleForUser = async (userId: string, email?: string): Promise<WorkerApprovalStatus | null> => {
    const { data } = await supabase.from('profiles').select('role,preferred_language').eq('id', userId).maybeSingle();
    if (data?.preferred_language === 'ur' || data?.preferred_language === 'en') setLanguageState(data.preferred_language);
    const resolvedRole = (data?.role as 'customer' | 'worker' | 'admin') ?? 'customer';
    let approval: WorkerApprovalStatus | null = null;
    let reason: string | null = null;
    if (resolvedRole === 'worker') {
      const { data: wp } = await supabase
        .from('worker_profiles')
        .select('approval_status, rejection_reason')
        .eq('user_id', userId)
        .maybeSingle();
      approval = (wp?.approval_status as WorkerApprovalStatus) ?? null;
      reason = approval === 'rejected' ? ((wp?.rejection_reason as string | null) ?? null) : null;
    }
    // Set together so a worker never renders with a stale/unknown approval status.
    setWorkerApprovalStatus(approval);
    setRejectionReason(reason);
    setRoleState(resolvedRole);
    if (resolvedRole === 'worker') void flushPendingUploads(userId, email);
    return approval;
  };

  const refreshApproval = async (): Promise<WorkerApprovalStatus | null> => {
    if (useFixtureMode) return null;
    const uid = session?.user?.id;
    return uid ? applyRoleForUser(uid, session?.user?.email) : null;
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
            await applyRoleForUser(s.user.id, s.user.email);
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

    // Callback must not await supabase calls: signUp/signIn wait for it while holding the auth lock,
    // so a query here deadlocks them and the screen stays on its spinner. Defer the work instead.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s?.user?.id) {
        setRoleState(null);
        setWorkerApprovalStatus(null);
        return;
      }
      setTimeout(() => {
        void applyRoleForUser(s.user.id, s.user.email);
      }, 0);
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
      setSession(null);
      setRoleState(null);
      setWorkerApprovalStatus(null);
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
    if (useFixtureMode) {
      setPreviewRole(r);
      return;
    }
    if (!session?.user?.id) return;
    const { error } = await supabase.from('profiles').update({ role: r }).eq('id', session.user.id);
    if (error) throw error;
    setRoleState(r);
    if (r === 'worker') await applyRoleForUser(session.user.id);
    else setWorkerApprovalStatus(null);
  };

  const setLanguage = async (l: AppLanguage) => {
    setLanguageState(l);
    if (useFixtureMode || !session?.user?.id) return;
    const { error } = await supabase.from('profiles').update({ preferred_language: l }).eq('id', session.user.id);
    if (error) throw error;
  };

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      loading,
      role,
      workerApprovalStatus,
      language,
      setLanguage,
      rejectionReason,
      signIn,
      signUp,
      signOut,
      refreshApproval,
      registering,
      setRegistering,
      setRole,
    }),
    [session, loading, role, workerApprovalStatus, rejectionReason, registering, language]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
