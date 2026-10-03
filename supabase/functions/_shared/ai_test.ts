import { assert, assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';

import {
  Blocked,
  buildMessages,
  containsContact,
  type Deps,
  mentionsMoney,
  parseDraft,
  parseModelJson,
  parseQuestions,
  parseRequest,
  parseTranslation,
  runAi,
  type AiRequest,
} from './ai.ts';
import { callGroq } from './groq.ts';

const jobReq = (over: Record<string, unknown> = {}) => ({
  action: 'draft',
  kind: 'job',
  lang: 'en',
  text: 'Kitchen tap leaking',
  categories: ['plumber', 'electrician'],
  ...over,
});

const okReq = (over: Record<string, unknown> = {}): AiRequest => {
  const p = parseRequest(jobReq(over));
  assert(p.ok);
  return p.req;
};

const GOOD_JOB_DRAFT = {
  source: 'en',
  category: 'plumber',
  title: { en: 'Kitchen tap leaking', ur: 'کچن کے نل سے پانی ٹپک رہا ہے' },
  description: { en: 'Water drips from the mixer even when it is closed.', ur: 'مکسر بند ہونے کے باوجود پانی ٹپکتا رہتا ہے۔' },
};

Deno.test('containsContact catches Latin and Urdu digits, links and handles', () => {
  assert(containsContact('call 0300 1234567'));
  assert(containsContact('رابطہ ۰۳۰۰۱۲۳۴۵۶۷'));
  assert(containsContact('٠٣٠٠١٢٣٤٥٦٧'));
  assert(containsContact('see www.example.com'));
  assert(containsContact('mail a.b@example.com'));
  assert(!containsContact('Block 7, house 14'));
  assert(!containsContact('کچن کے نل سے پانی ٹپک رہا ہے'));
});

Deno.test('mentionsMoney catches prices in English and Urdu', () => {
  assert(mentionsMoney('What is your budget?'));
  assert(mentionsMoney('It will cost Rs 500'));
  assert(mentionsMoney('1,500 rupees'));
  assert(mentionsMoney('آپ کا بجٹ کیا ہے؟'));
  assert(mentionsMoney('قیمت 500 روپے'));
  assert(!mentionsMoney('Water drips from the mixer'));
  assert(!mentionsMoney('پانی ٹپک رہا ہے'));
});

Deno.test('parseRequest accepts a good request and normalises it', () => {
  const r = okReq({ text: '  Kitchen   tap leaking  ' });
  assertEquals(r.text, 'Kitchen tap leaking');
  assertEquals(r.lang, 'en');
  assertEquals(r.categories, ['plumber', 'electrician']);
});

Deno.test('parseRequest refuses bad shapes', () => {
  for (const bad of [null, 'x', {}, jobReq({ action: 'chat' }), jobReq({ kind: 'other' }), jobReq({ text: 5 })]) {
    const p = parseRequest(bad);
    assert(!p.ok && p.error === 'bad_request', JSON.stringify(bad));
  }
});

Deno.test('a job needs some text or answers; a listing may start from answers alone', () => {
  assert(!parseRequest(jobReq({ text: '' })).ok);
  assert(parseRequest(jobReq({ text: '', answers: [{ question: 'Where?', answer: 'Tap spout' }] })).ok);
  assert(parseRequest({ action: 'draft', kind: 'listing', lang: 'ur', text: '' }).ok);
});

Deno.test('parseRequest refuses a phone number in the text, in an answer, or in a field', () => {
  for (const body of [
    jobReq({ text: 'call 03001234567' }),
    jobReq({ answers: [{ question: 'When?', answer: '۰۳۰۰۱۲۳۴۵۶۷' }] }),
    { action: 'translate', kind: 'job', from: 'en', fields: { description: 'ring 0300 1234567' } },
  ]) {
    const p = parseRequest(body);
    assert(!p.ok && p.error === 'contact', JSON.stringify(body));
  }
});

Deno.test('parseRequest limits answers and translate fields', () => {
  const many = Array.from({ length: 7 }, () => ({ question: 'q', answer: 'a' }));
  assert(!parseRequest(jobReq({ answers: many })).ok);
  assert(!parseRequest({ action: 'translate', kind: 'job', from: 'en', fields: {} }).ok);
  assert(!parseRequest({ action: 'translate', kind: 'job', from: 'en', fields: { secret: 'x' } }).ok);
  assert(parseRequest({ action: 'translate', kind: 'job', from: 'ur', fields: { title: 'نل لیک' } }).ok);
});

Deno.test('prompts carry the rules, the data, and only job categories for jobs', () => {
  const m = buildMessages(okReq());
  assertEquals(m[0].role, 'system');
  assert(m[0].content.includes('Never write or guess phone numbers'));
  assert(m[0].content.includes('Never ask about money'));
  assert(m[1].content.includes('Kitchen tap leaking'));
  assert(m[1].content.includes('plumber'));
  const l = buildMessages(okReq({ kind: 'listing', categories: ['plumber'] }));
  assert(!l[1].content.includes('plumber'));
  const q = buildMessages(okReq({ action: 'questions', lang: 'ur' }));
  assert(q[0].content.includes('Urdu (Urdu script)'));
});

Deno.test('translate prompt goes from the given language to the other one', () => {
  const body = { action: 'translate', kind: 'job', from: 'ur', fields: { title: 'نل لیک' } };
  const p = parseRequest(body);
  assert(p.ok);
  const m = buildMessages(p.req);
  assert(m[0].content.includes('from Urdu (Urdu script) into English'));
});

Deno.test('parseModelJson reads plain and fenced JSON', () => {
  assertEquals(parseModelJson('{"a":1}'), { a: 1 });
  assertEquals(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
  assertThrows(() => parseModelJson('not json'));
});

Deno.test('parseQuestions keeps at most three, and drops money questions and ones with nothing to tap', () => {
  const qs = parseQuestions({
    questions: [
      { id: 'a', text: 'Where is the water coming from?', options: ['Tap spout', 'Pipe under sink', 'Both'] },
      { id: 'b', text: 'What is your budget?', options: ['Low', 'High'] },
      { id: 'c', text: 'Only one option?', options: ['Yes'] },
      { id: 'd', text: 'When should the Ustad come?', options: ['Today', 'Tomorrow', 'This week', 'Anytime', 'Extra'] },
      { id: 'e', text: 'Is the water supply off?', options: ['Yes', 'No'] },
      { id: 'f', text: 'Fourth question?', options: ['Yes', 'No'] },
    ],
  });
  assertEquals(qs.map((q) => q.text), ['Where is the water coming from?', 'When should the Ustad come?', 'Is the water supply off?']);
  assertEquals(qs[1].options.length, 4);
  assertEquals(qs.map((q) => q.id), ['q1', 'q2', 'q3']);
  assertEquals(parseQuestions({ questions: [] }), []);
  assertThrows(() => parseQuestions({}), Blocked);
});

Deno.test('parseDraft accepts a good job draft and checks the category against the allowed list', () => {
  const r = okReq();
  const d = parseDraft(GOOD_JOB_DRAFT, r);
  assertEquals((d as { category: string }).category, 'plumber');
  const other = parseDraft({ ...GOOD_JOB_DRAFT, category: 'astronaut' }, r);
  assertEquals((other as { category: string | null }).category, null);
});

Deno.test('parseDraft refuses drafts with a phone number, money, or a missing language', () => {
  const r = okReq();
  assertThrows(() => parseDraft({ ...GOOD_JOB_DRAFT, description: { ...GOOD_JOB_DRAFT.description, en: 'Call 0300 1234567 now' } }, r), Blocked);
  assertThrows(() => parseDraft({ ...GOOD_JOB_DRAFT, title: { ...GOOD_JOB_DRAFT.title, ur: 'فون ۰۳۰۰۱۲۳۴۵۶۷' } }, r), Blocked);
  assertThrows(() => parseDraft({ ...GOOD_JOB_DRAFT, description: { ...GOOD_JOB_DRAFT.description, en: 'Fix it for Rs 500 please' } }, r), Blocked);
  assertThrows(() => parseDraft({ ...GOOD_JOB_DRAFT, title: { en: 'Tap', ur: 'Tap' } }, r), Blocked);
  assertThrows(() => parseDraft({ ...GOOD_JOB_DRAFT, title: { en: 'x'.repeat(81), ur: 'نل' } }, r), Blocked);
  assertThrows(() => parseDraft({ source: 'en' }, r), Blocked);
});

Deno.test('parseDraft handles a listing draft', () => {
  const r = okReq({ kind: 'listing' });
  const d = parseDraft(
    { source: 'ur', headline: { en: 'Leak and tap repair', ur: 'نل اور لیکیج کی مرمت' }, about: { en: 'I fix mixers and pipes.', ur: 'میں مکسر اور پائپ ٹھیک کرتا ہوں۔' } },
    r,
  );
  assertEquals(d.source, 'ur');
  assertEquals((d as { headline: { en: string } }).headline.en, 'Leak and tap repair');
});

Deno.test('parseTranslation checks the target language and that every field came back', () => {
  const p = parseRequest({ action: 'translate', kind: 'job', from: 'en', fields: { title: 'Leaking tap', description: 'Water drips.' } });
  assert(p.ok);
  assertEquals(parseTranslation({ fields: { title: 'نل لیک', description: 'پانی ٹپکتا ہے۔' } }, p.req), { title: 'نل لیک', description: 'پانی ٹپکتا ہے۔' });
  assertThrows(() => parseTranslation({ fields: { title: 'نل لیک' } }, p.req), Blocked);
  assertThrows(() => parseTranslation({ fields: { title: 'Leaking tap', description: 'Water drips.' } }, p.req), Blocked);
});

// ─── runAi with fake dependencies ───

type Spy = { consumed: Array<[string, number]>; refunded: string[]; logs: Array<Record<string, unknown>>; model: number };

function makeDeps(over: Partial<Deps> = {}, settings: Record<string, unknown> = {}): { deps: Deps; spy: Spy } {
  const spy: Spy = { consumed: [], refunded: [], logs: [], model: 0 };
  const s: Record<string, unknown> = { ai_help_enabled: true, ai_daily_limit_user: 5, ai_daily_limit_guest: 2, ...settings };
  const deps: Deps = {
    getSetting: (k) => Promise.resolve(s[k]),
    identify: () => Promise.resolve({ key: 'u:1', guest: false }),
    consume: (k, l) => {
      spy.consumed.push([k, l]);
      return Promise.resolve(true);
    },
    refund: (k) => {
      spy.refunded.push(k);
      return Promise.resolve();
    },
    log: (e) => {
      spy.logs.push(e);
      return Promise.resolve();
    },
    callModel: () => {
      spy.model++;
      return Promise.resolve({ content: JSON.stringify(GOOD_JOB_DRAFT), tokensIn: 100, tokensOut: 200 });
    },
    now: () => 1000,
    ...over,
  };
  return { deps, spy };
}

Deno.test('runAi returns a draft, uses one unit, and logs counts only', async () => {
  const { deps, spy } = makeDeps();
  const r = await runAi(jobReq(), deps);
  assert(r.ok);
  assertEquals(spy.consumed, [['u:1', 5]]);
  assertEquals(spy.refunded, []);
  assertEquals(spy.logs.length, 1);
  assertEquals(spy.logs[0].ok, true);
  assertEquals(spy.logs[0].tokensOut, 200);
  assert(!JSON.stringify(spy.logs[0]).includes('Kitchen'));
});

Deno.test('runAi does nothing while AI help is off', async () => {
  const { deps, spy } = makeDeps({}, { ai_help_enabled: false });
  assertEquals(await runAi(jobReq(), deps), { ok: false, error: 'disabled' });
  assertEquals(spy.consumed.length, 0);
  assertEquals(spy.model, 0);
});

Deno.test('runAi applies the guest limit to guests and the user limit to people', async () => {
  const g = makeDeps({ identify: () => Promise.resolve({ key: 'g:abc', guest: true }) });
  await runAi(jobReq(), g.deps);
  assertEquals(g.spy.consumed, [['g:abc', 2]]);
  const u = makeDeps();
  await runAi(jobReq(), u.deps);
  assertEquals(u.spy.consumed, [['u:1', 5]]);
});

Deno.test('runAi stops at the limit without calling the model', async () => {
  const { deps, spy } = makeDeps({ consume: () => Promise.resolve(false) });
  assertEquals(await runAi(jobReq(), deps), { ok: false, error: 'limit' });
  assertEquals(spy.model, 0);
});

Deno.test('runAi never spends allowance or calls the model for a request with a phone number', async () => {
  const { deps, spy } = makeDeps();
  assertEquals(await runAi(jobReq({ text: 'call 03001234567' }), deps), { ok: false, error: 'contact' });
  assertEquals(spy.consumed.length, 0);
  assertEquals(spy.model, 0);
});

Deno.test('runAi refunds and logs when the model fails', async () => {
  const { deps, spy } = makeDeps({ callModel: () => Promise.reject(new Error('model request failed (500)')) });
  assertEquals(await runAi(jobReq(), deps), { ok: false, error: 'ai_failed' });
  assertEquals(spy.refunded, ['u:1']);
  assertEquals(spy.logs[0].ok, false);
});

Deno.test('runAi refunds and says blocked when the answer has a price or a phone number', async () => {
  for (const bad of [
    { ...GOOD_JOB_DRAFT, description: { ...GOOD_JOB_DRAFT.description, en: 'It costs Rs 800' } },
    { ...GOOD_JOB_DRAFT, description: { ...GOOD_JOB_DRAFT.description, en: 'Call 0300 1234567' } },
  ]) {
    const { deps, spy } = makeDeps({ callModel: () => Promise.resolve({ content: JSON.stringify(bad) }) });
    assertEquals(await runAi(jobReq(), deps), { ok: false, error: 'blocked' });
    assertEquals(spy.refunded, ['u:1']);
  }
});

Deno.test('runAi treats text that is not JSON as an AI failure', async () => {
  const { deps, spy } = makeDeps({ callModel: () => Promise.resolve({ content: 'Sure! Here you go' }) });
  assertEquals(await runAi(jobReq(), deps), { ok: false, error: 'ai_failed' });
  assertEquals(spy.refunded.length, 1);
});

Deno.test('runAi asks questions and translates', async () => {
  const q = makeDeps({
    callModel: () => Promise.resolve({ content: JSON.stringify({ questions: [{ id: 'x', text: 'Where is it leaking?', options: ['Tap', 'Pipe'] }] }) }),
  });
  const r = await runAi(jobReq({ action: 'questions' }), q.deps);
  assert(r.ok && r.action === 'questions');
  assertEquals((r.data as { questions: unknown[] }).questions.length, 1);

  const t = makeDeps({ callModel: () => Promise.resolve({ content: JSON.stringify({ fields: { title: 'نل لیک' } }) }) });
  const tr = await runAi({ action: 'translate', kind: 'job', from: 'en', fields: { title: 'Leaking tap' } }, t.deps);
  assert(tr.ok);
  assertEquals((tr.data as { to: string }).to, 'ur');
});

// ─── callGroq with a fake fetch ───

Deno.test('callGroq sends the key, model and JSON mode, and reads the answer and usage', async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const fake = ((url: string, init: RequestInit) => {
    seen = { url, init };
    return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":1}' } }], usage: { prompt_tokens: 12, completion_tokens: 34 } })));
  }) as unknown as typeof fetch;
  const out = await callGroq([{ role: 'user', content: 'hi' }], { apiKey: 'secret-key', model: 'm-1', reasoningEffort: 'low' }, fake);
  assertEquals(out, { content: '{"ok":1}', tokensIn: 12, tokensOut: 34 });
  assertEquals(seen!.url, 'https://api.groq.com/openai/v1/chat/completions');
  assertEquals((seen!.init.headers as Record<string, string>).authorization, 'Bearer secret-key');
  const body = JSON.parse(seen!.init.body as string);
  assertEquals(body.model, 'm-1');
  assertEquals(body.response_format, { type: 'json_object' });
  assertEquals(body.reasoning_effort, 'low');
});

Deno.test('callGroq leaves out reasoning_effort when it is not set', async () => {
  let body: Record<string, unknown> = {};
  const fake = ((_u: string, init: RequestInit) => {
    body = JSON.parse(init.body as string);
    return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] })));
  }) as unknown as typeof fetch;
  await callGroq([], { apiKey: 'k', model: 'm' }, fake);
  assert(!('reasoning_effort' in body));
});

Deno.test('callGroq errors never contain the key', async () => {
  const fail = (() => Promise.resolve(new Response('bad', { status: 401 }))) as unknown as typeof fetch;
  const e = await assertRejects(() => callGroq([], { apiKey: 'secret-key', model: 'm' }, fail));
  assert(!String((e as Error).message).includes('secret-key'));
  assertEquals((e as Error).message, 'model request failed (401)');
  await assertRejects(() => callGroq([], { apiKey: '', model: 'm' }, fail), Error, 'not configured');
  const empty = (() => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: ' ' } }] })))) as unknown as typeof fetch;
  await assertRejects(() => callGroq([], { apiKey: 'k', model: 'm' }, empty), Error, 'empty');
});

Deno.test('callGroq gives up after the timeout', async () => {
  const slow = ((_u: string, init: RequestInit) =>
    new Promise((_res, rej) => {
      init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;
  await assertRejects(() => callGroq([], { apiKey: 'k', model: 'm', timeoutMs: 20 }, slow), Error, 'timed out');
});
