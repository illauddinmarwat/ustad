import type { Message, ModelReply } from './ai.ts';

export type GroqConfig = {
  apiKey: string;
  model: string;
  /** Optional, for reasoning models (e.g. "low"). Left out when empty. */
  reasoningEffort?: string;
  timeoutMs?: number;
  maxTokens?: number;
};

const URL = 'https://api.groq.com/openai/v1/chat/completions';

/** One chat completion that must answer with a JSON object. Throws a short error that never contains the key. */
export async function callGroq(
  messages: Message[],
  cfg: GroqConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ModelReply> {
  if (!cfg.apiKey || !cfg.model) throw new Error('AI is not configured');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs ?? 20_000);
  try {
    const res = await fetchImpl(URL, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0.3,
        max_tokens: cfg.maxTokens ?? 1200,
        response_format: { type: 'json_object' },
        ...(cfg.reasoningEffort ? { reasoning_effort: cfg.reasoningEffort } : {}),
      }),
    });
    if (!res.ok) throw new Error(`model request failed (${res.status})`);
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('empty model answer');
    return { content, tokensIn: json?.usage?.prompt_tokens, tokensOut: json?.usage?.completion_tokens };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('model request timed out');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
