'use client';

import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import type { PaymentMethods } from '@/lib/types';

type Branding = { name: string; tagline: string };

export default function SettingsPage() {
  const [branding, setBranding] = useState<Branding>({ name: 'Ustad', tagline: 'Learn & Teach' });
  const [commissionRate, setCommissionRate] = useState(15);
  const [methods, setMethods] = useState<PaymentMethods>({ easypaisa: true, jazzcash: true, cash: true });
  const [loading, setLoading] = useState(true);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [brandingRes, rateRes, methodsRes] = await Promise.all([
        supabase.rpc('get_app_setting', { p_key: 'app_branding' }),
        supabase.rpc('get_app_setting', { p_key: 'commission_rate_pct' }),
        supabase.rpc('get_app_setting', { p_key: 'payment_methods' }),
      ]);
      if (brandingRes.data) setBranding(brandingRes.data as Branding);
      if (typeof rateRes.data === 'number') setCommissionRate(rateRes.data);
      if (methodsRes.data) setMethods(methodsRes.data as PaymentMethods);
      setLoading(false);
    })();
  }, []);

  const save = async (key: string, value: unknown) => {
    const { error } = await supabase.rpc('admin_set_app_setting', { p_key: key, p_value: value });
    if (!error) {
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 2000);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-strong">Settings</h1>
      <p className="mb-6 text-sm text-ink-muted">Manage your app settings and preferences</p>

      {loading ? <p className="text-sm text-ink-muted">Loading…</p> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl2 border border-border bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink-strong">General Settings</h2>
          <Field label="App Name">
            <input
              value={branding.name}
              onChange={(e) => setBranding((b) => ({ ...b, name: e.target.value }))}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Tagline">
            <input
              value={branding.tagline}
              onChange={(e) => setBranding((b) => ({ ...b, tagline: e.target.value }))}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
          <SaveButton onClick={() => save('app_branding', branding)} saved={savedKey === 'app_branding'} />
        </section>

        <section className="rounded-xl2 border border-border bg-surface p-5">
          <h2 className="mb-1 text-sm font-semibold text-ink-strong">Commission Settings</h2>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs text-ink-muted">Commission rate</span>
            <span className="text-sm font-bold text-primary">{commissionRate}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={30}
            value={commissionRate}
            onChange={(e) => setCommissionRate(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="mt-1 flex justify-between text-xs text-ink-muted">
            <span>0%</span>
            <span>Recommended: 10–20%</span>
            <span>30%</span>
          </div>
          <SaveButton onClick={() => save('commission_rate_pct', commissionRate)} saved={savedKey === 'commission_rate_pct'} />
        </section>

        <section className="rounded-xl2 border border-border bg-surface p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-ink-strong">Payment Methods</h2>
          <div className="space-y-3">
            {(Object.keys(methods) as (keyof PaymentMethods)[]).map((key) => (
              <label key={key} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <span className="text-sm font-medium capitalize text-ink-body">{key}</span>
                <input
                  type="checkbox"
                  checked={methods[key]}
                  onChange={(e) => setMethods((m) => ({ ...m, [key]: e.target.checked }))}
                  className="h-5 w-5 accent-primary"
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">At least one payment method must be enabled.</p>
          <SaveButton onClick={() => save('payment_methods', methods)} saved={savedKey === 'payment_methods'} />
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1 block text-xs font-medium text-ink-muted">{label}</label>
      {children}
    </div>
  );
}

function SaveButton({ onClick, saved }: { onClick: () => void; saved: boolean }) {
  return (
    <button
      onClick={onClick}
      className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-deep"
    >
      {saved ? 'Saved ✓' : 'Save Changes'}
    </button>
  );
}
