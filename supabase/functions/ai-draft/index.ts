// Edge Function `ai-draft`: "Help me write" for job posts and service listings.
// Secrets (Supabase Dashboard > Edge Functions > Secrets): GROQ_API_KEY, GROQ_MODEL.
// Optional: GROQ_REASONING_EFFORT. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { runAi, type Deps } from '../_shared/ai.ts';
import { callGroq } from '../_shared/groq.ts';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-device-id',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ ok: false, error: 'bad_request' }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply({ ok: false, error: 'bad_request' });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const deps: Deps = {
    getSetting: async (key) => {
      const { data } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle();
      return (data as { value?: unknown } | null)?.value;
    },
    identify: async () => {
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      if (token) {
        const { data } = await admin.auth.getUser(token);
        if (data?.user?.id) return { key: `u:${data.user.id}`, guest: false };
      }
      // A guest: the anon key carries no person, so count by device and address.
      const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
      const device = req.headers.get('x-device-id') ?? '';
      return { key: `g:${await sha256(`${ip}|${device}`)}`, guest: true };
    },
    consume: async (key, limit) => {
      const { data, error } = await admin.rpc('ai_consume', { p_key: key, p_limit: limit });
      if (error) throw new Error('allowance check failed');
      return data === true;
    },
    refund: async (key) => {
      await admin.rpc('ai_refund', { p_key: key });
    },
    log: async (e) => {
      await admin.rpc('ai_log_call', {
        p_key: e.key, p_action: e.action, p_kind: e.kind, p_ok: e.ok, p_error: e.error ?? null,
        p_tokens_in: e.tokensIn ?? null, p_tokens_out: e.tokensOut ?? null, p_latency_ms: e.latencyMs,
      });
    },
    callModel: (messages) =>
      callGroq(messages, {
        apiKey: Deno.env.get('GROQ_API_KEY') ?? '',
        model: Deno.env.get('GROQ_MODEL') ?? '',
        reasoningEffort: Deno.env.get('GROQ_REASONING_EFFORT') ?? undefined,
      }),
    now: () => Date.now(),
  };

  try {
    return reply(await runAi(body, deps));
  } catch (e) {
    console.error('ai-draft failed', e instanceof Error ? e.message : 'error');
    return reply({ ok: false, error: 'ai_failed' });
  }
});
