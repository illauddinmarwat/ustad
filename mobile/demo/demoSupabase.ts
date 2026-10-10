import { store } from './demoStore';

export const supabaseUrl = 'https://demo.local';
export const supabaseAnonKey = 'demo';
export { isSupabaseConfigured, useFixtureMode } from './demoEnv';

type Row = Record<string, unknown>;
type Result = { data: unknown; error: null };
type Cb = (p: { eventType: string; new: Row }) => void;

function builder(table: string) {
  let op: 'select' | 'insert' = 'select';
  let payload: Row | null = null;
  let filterKeys: string[] | null = null;

  const list = (): unknown => {
    if (table === 'messages') return store.messages;
    if (table === 'app_settings') return (filterKeys ?? []).map((key) => ({ key, value: key === 'phase4_realtime_enabled' }));
    return [];
  };
  const one = (): unknown => {
    if (table === 'jobs') return store.job;
    if (table === 'job_realtime_states') return store.realtime;
    if (table === 'reviews') return store.review;
    if (table === 'quotes') return { amount_pkr: 2500 };
    return null;
  };
  const run = (): Result => {
    if (op === 'insert' && table === 'messages' && payload) {
      const row = { id: `m${store.messages.length + 1}`, created_at: new Date().toISOString(), ...payload };
      store.messages = [...store.messages, row];
      store.emit('messages', 'INSERT', row);
    }
    if (op === 'insert' && table === 'reviews' && payload) store.review = { id: 'r1', ...payload };
    return { data: op === 'select' ? list() : null, error: null };
  };

  const api: Record<string, unknown> = {
    select: () => api,
    order: () => api,
    eq: () => api,
    is: () => api,
    limit: () => api,
    in: (_col: string, vals: string[]) => {
      filterKeys = vals;
      return api;
    },
    insert: (row: Row) => {
      op = 'insert';
      payload = row;
      return api;
    },
    maybeSingle: () => Promise.resolve({ data: one(), error: null }),
    then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  };
  return api;
}

export const supabase = {
  from: (table: string) => builder(table),
  rpc: (fn: string, args: Row = {}) => Promise.resolve(store.rpc(fn, args)),
  channel: () => {
    const mine: Array<{ table: string; cb: Cb }> = [];
    const ch = {
      on(_type: string, cfg: { table: string }, cb: Cb) {
        mine.push({ table: cfg.table, cb });
        return ch;
      },
      subscribe() {
        mine.forEach((l) => store.listeners.add(l));
        return ch;
      },
      _mine: mine,
    };
    return ch;
  },
  removeChannel: (ch: { _mine?: Array<{ table: string; cb: Cb }> }) => {
    ch._mine?.forEach((l) => store.listeners.delete(l));
    return Promise.resolve();
  },
  auth: {
    getSession: () => Promise.resolve({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
};
