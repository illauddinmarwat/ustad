import { useCallback, useEffect, useState } from 'react';

import type { CommissionEntry } from './commission';
import { supabase } from './supabase';

/**
 * Ustad-side figures. Earnings come from the Hisab ledger (jobs where the worker confirmed
 * receiving payment), so they cover recorded jobs only. Availability is `worker_profiles.is_available`.
 */
export type EarningsSummary = {
  monthGross: number;
  monthCommission: number;
  monthNet: number;
  monthJobs: number;
  weekJobs: number;
};

const WEEK_MS = 7 * 86_400_000;

export function summarizeEarnings(entries: CommissionEntry[], now: Date = new Date()): EarningsSummary {
  let monthGross = 0;
  let monthCommission = 0;
  let monthJobs = 0;
  let weekJobs = 0;
  for (const e of entries) {
    const at = new Date(e.created_at);
    if (Number.isNaN(at.getTime())) continue;
    if (now.getTime() - at.getTime() <= WEEK_MS && at.getTime() <= now.getTime()) weekJobs += 1;
    if (at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth()) {
      monthGross += Number(e.order_amount_pkr) || 0;
      monthCommission += e.ledger_status === 'waived' ? 0 : Number(e.commission_pkr) || 0;
      monthJobs += 1;
    }
  }
  return { monthGross, monthCommission, monthNet: monthGross - monthCommission, monthJobs, weekJobs };
}

export function formatPkr(n: number): string {
  return `Rs ${Math.round(n).toLocaleString('en-US')}`;
}

/** The signed-in worker's recorded jobs, newest first. */
export function useWorkerEarnings(userId: string | undefined) {
  const [entries, setEntries] = useState<CommissionEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.rpc('list_my_commissions', { p_limit: 100 });
    setEntries(Array.isArray(data) ? (data as CommissionEntry[]) : []);
    setLoaded(true);
  }, [userId]);
  useEffect(() => {
    refresh().catch(() => setLoaded(true));
  }, [refresh]);
  return { entries, loaded, refresh, summary: summarizeEarnings(entries) };
}

export function useWorkerAvailability(userId: string | undefined) {
  const [available, setAvailable] = useState(true);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    supabase
      .from('worker_profiles')
      .select('is_available')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (live && data && typeof data.is_available === 'boolean') setAvailable(data.is_available);
      });
    return () => {
      live = false;
    };
  }, [userId]);
  const toggle = async (value: boolean) => {
    setAvailable(value);
    const { error } = await supabase.rpc('worker_set_availability', { p_available: value });
    if (error) setAvailable(!value);
  };
  return { available, toggle };
}
