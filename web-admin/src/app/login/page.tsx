'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { useAdminAuth } from '@/lib/useAdminAuth';

export default function LoginPage() {
  const router = useRouter();
  const { loading, session, isAdmin } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session && isAdmin) router.replace('/payments');
  }, [loading, session, isAdmin, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (signInError) setError(signInError.message);
  };

  const notAdmin = !loading && session && !isAdmin;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl2 border border-border bg-surface p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white">🎓</div>
          <div>
            <div className="text-lg font-bold text-ink-strong">Ustad Admin</div>
            <div className="text-xs text-ink-muted">استاد ایڈمن</div>
          </div>
        </div>

        <h1 className="mb-1 text-xl font-semibold text-ink-strong">Sign in</h1>
        <p className="mb-6 text-sm text-ink-muted">Admin access only.</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-body">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-body">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {notAdmin ? (
            <p className="text-sm text-danger">
              This account is signed in but does not have admin access.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-deep disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
