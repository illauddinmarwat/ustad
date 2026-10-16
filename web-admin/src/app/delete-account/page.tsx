'use client';

import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useState } from 'react';

const support = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

// A throwaway client: no stored session, so this public page never touches the admin panel's sign-in.
function tempClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const inputClass =
  'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary';

export default function DeleteAccountPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm) return;
    setBusy(true);
    setError(null);
    const client = tempClient();
    const { error: signInError } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setBusy(false);
      setError('Wrong email or password.');
      return;
    }
    const { error: rpcError } = await client.rpc('delete_my_account');
    await client.auth.signOut().catch(() => undefined);
    setBusy(false);
    if (rpcError) setError(rpcError.message);
    else setDone(true);
  };

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold text-ink-strong">Delete your Ustad account</h1>
      {done ? (
        <p className="mt-6 rounded-lg bg-primary-soft p-4 text-sm text-primary-deep">
          Your account has been deleted. Your personal details, CNIC images, photos and notifications were removed and
          the sign-in is locked.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm leading-6 text-ink-body">
            Deleting removes your name, phone, address, CNIC details and photos, profile photo, location and
            notifications, and signs you out for good. Completed jobs and payments stay on record without your
            details. <strong>This cannot be undone.</strong> You cannot delete while a job is in progress.
          </p>
          <p className="mt-2 text-sm text-ink-body">
            You can also do this in the app: Account &rarr; Delete my account. See the{' '}
            <Link href="/privacy/" className="text-primary underline">
              privacy policy
            </Link>
            .
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl2 border border-border bg-surface p-6">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-body">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-body">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <label className="flex items-start gap-2 text-sm text-ink-body">
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-1" />
              <span>I understand my account will be permanently deleted.</span>
            </label>
            {error ? <p className="rounded-lg bg-danger-soft p-2 text-sm text-danger">{error}</p> : null}
            <button
              type="submit"
              disabled={busy || !confirm}
              className="w-full rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Deleting…' : 'Delete my account'}
            </button>
          </form>
          <p className="mt-4 text-sm text-ink-muted">
            Forgot your password? Reset it from the app&rsquo;s sign-in screen first.
            {support ? (
              <>
                {' '}
                Or email{' '}
                <a className="text-primary underline" href={`mailto:${support}`}>
                  {support}
                </a>{' '}
                from your registered address and we will delete it for you.
              </>
            ) : null}
          </p>
        </>
      )}
    </main>
  );
}
