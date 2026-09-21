'use client';

import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import type { PaymentMethods, SettingAuditRow } from '@/lib/types';

type Branding = { name: string; tagline: string };

// Number settings for cash payments, Hisab (worker dues) and request timeouts.
const OPS_NUMBERS: Array<{ key: string; label: string; hint: string; fallback: number }> = [
  { key: 'commission_due_days', label: 'Commission due after (days)', hint: 'Days after a job closes that the worker must pay Ustad.', fallback: 7 },
  { key: 'commission_warn_days', label: 'Warn after (days overdue)', hint: 'Send the deactivation warning this many days after the due date.', fallback: 7 },
  { key: 'commission_deactivate_days', label: 'Deactivate after (days overdue)', hint: 'Suspend the worker this many days after the due date until they settle.', fallback: 14 },
  { key: 'direct_request_timeout_hours', label: 'Direct request timeout (hours)', hint: 'How long a worker has to answer before the request opens up.', fallback: 2 },
  { key: 'payment_confirm_days', label: 'Payment receipt window (days)', hint: 'After a customer marks a job paid, the worker has this long to confirm before it becomes a dispute.', fallback: 3 },
];

export default function SettingsPage() {
  const [branding, setBranding] = useState<Branding>({ name: 'Ustad', tagline: 'Learn & Teach' });
  const [commissionRate, setCommissionRate] = useState(15);
  const [methods, setMethods] = useState<PaymentMethods>({ easypaisa: true, jazzcash: true, cash: true });
  const [loading, setLoading] = useState(true);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [ops, setOps] = useState<Record<string, number>>({});
  const [helpline, setHelpline] = useState('');
  const [audit, setAudit] = useState<SettingAuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      const opsRes = await Promise.all(OPS_NUMBERS.map((o) => supabase.rpc('get_app_setting', { p_key: o.key })));
      const next: Record<string, number> = {};
      OPS_NUMBERS.forEach((o, i) => {
        const v = opsRes[i].data;
        next[o.key] = typeof v === 'number' ? v : o.fallback;
      });
      setOps(next);
      const hl = await supabase.rpc('get_app_setting', { p_key: 'helpline_number' });
      if (typeof hl.data === 'string') setHelpline(hl.data);
      const au = await supabase.rpc('admin_list_setting_audit', { p_limit: 20 });
      if (!au.error) setAudit((au.data ?? []) as SettingAuditRow[]);
      setLoading(false);
    })();
  }, []);

  const save = async (key: string, value: unknown) => {
    setError(null);
    const { error: saveError } = await supabase.rpc('admin_set_app_setting', { p_key: key, p_value: value });
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setSavedKey(key);
    setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 2000);
    const au = await supabase.rpc('admin_list_setting_audit', { p_limit: 20 });
    if (!au.error) setAudit((au.data ?? []) as SettingAuditRow[]);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-strong">Settings</h1>
      <p className="mb-6 text-sm text-ink-muted">Manage your app settings and preferences</p>

      {loading ? <p className="text-sm text-ink-muted">Loading…</p> : null}
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

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

        <section className="rounded-xl2 border border-border bg-surface p-5 lg:col-span-2">
          <h2 className="mb-1 text-sm font-semibold text-ink-strong">Operations and Hisab</h2>
          <p className="mb-4 text-xs text-ink-muted">
            Commission is charged on the amount a worker confirms receiving. The commission rate above is copied onto each job when it
            closes, so changing it later does not change past jobs.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {OPS_NUMBERS.map((o) => (
              <div key={o.key} className="rounded-lg border border-border p-3">
                <label className="mb-1 block text-xs font-medium text-ink-muted">{o.label}</label>
                <input
                  type="number"
                  min={1}
                  value={ops[o.key] ?? o.fallback}
                  onChange={(e) => setOps((m) => ({ ...m, [o.key]: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <p className="mt-1 text-xs text-ink-muted">{o.hint}</p>
                <SaveButton onClick={() => save(o.key, ops[o.key] ?? o.fallback)} saved={savedKey === o.key} />
              </div>
            ))}
            <div className="rounded-lg border border-border p-3">
              <label className="mb-1 block text-xs font-medium text-ink-muted">Helpline number</label>
              <input
                value={helpline}
                onChange={(e) => setHelpline(e.target.value)}
                placeholder="e.g. 0800-12345"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <p className="mt-1 text-xs text-ink-muted">Shown to users when a payment problem needs a call. Currently a placeholder until you set it.</p>
              <SaveButton onClick={() => save('helpline_number', helpline)} saved={savedKey === 'helpline_number'} />
            </div>
          </div>
        </section>

        <section className="rounded-xl2 border border-border bg-surface p-5 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-ink-strong">Recent setting changes</h2>
          {audit.length === 0 ? <p className="text-xs text-ink-muted">No changes recorded yet.</p> : null}
          {audit.map((a) => (
            <div key={a.id} className="flex flex-wrap justify-between gap-2 border-t border-border py-2 text-xs first:border-t-0">
              <span className="font-medium text-ink-body">{a.key}</span>
              <span className="text-ink-muted">
                {JSON.stringify(a.old_value)} → {JSON.stringify(a.new_value)} · {a.changed_by_name ?? 'system'} ·{' '}
                {new Date(a.changed_at).toLocaleString()}
              </span>
            </div>
          ))}
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
