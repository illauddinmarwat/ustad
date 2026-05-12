/**
 * OCR provider abstraction (Phase 3).
 *
 * Two providers are wired:
 *   - Google Cloud Vision (live REST integration).
 *   - Groq Vision (scaffold; throws OcrUnavailable until the live integration
 *     lands — keeps the orchestrator's manual-fallback path well exercised).
 *
 * Credentials come from `mobile/.env` at build time and are exposed to the
 * client via `Constants.expoConfig.extra` (see `app.config.ts`). Recognised
 * env names:
 *
 *   - GOOGLE_VISION_API_KEY    → Google Vision provider
 *   - GROQ_API_KEY             → Groq provider
 *   - GROQ_VISION_MODEL        → Groq model id
 *   - VISION_PROVIDER          → default provider preference
 *
 * Risky behavior is still gated upstream by the `phase3_ocr_enabled` flag in
 * `app_settings`. Missing keys never throw to the caller — `extractDocument`
 * converts them into a `manual_fallback` envelope so the booking flow is
 * never blocked.
 */

import Constants from 'expo-constants';

import { OcrUnavailable, type OcrInput, type OcrProvider, type OcrProviderName } from './types';

const ENV_KEYS = {
  google: 'GOOGLE_VISION_API_KEY',
  groq: 'GROQ_API_KEY',
  groqModel: 'GROQ_VISION_MODEL',
  preferredProvider: 'VISION_PROVIDER',
} as const;

export const OCR_ENV_KEY_NAMES = ENV_KEYS;

const EXPO_EXTRA_KEYS = {
  google: 'googleVisionApiKey',
  groq: 'groqApiKey',
  groqModel: 'groqVisionModel',
  preferredProvider: 'visionProvider',
} as const;

const readProcessEnv = (name: string): string | undefined => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[name];
};

const readExpoExtra = (key: string): string | undefined => {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const raw = extra[key];
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
};

const readSecret = (extraKey: string, envName: string): string | undefined => {
  return readExpoExtra(extraKey) ?? readProcessEnv(envName);
};

/**
 * Live Google Cloud Vision provider — issues a TEXT_DETECTION request and
 * normalises the response into the project-wide `{ text, confidence }` shape.
 * Confidence is averaged across page-level confidences when available; falls
 * back to the symbol-level average; finally to a conservative 0.5 when the
 * API does not report any.
 */
export class GoogleVisionProvider implements OcrProvider {
  readonly name: OcrProviderName = 'google';

  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { endpoint?: string; fetchImpl?: typeof fetch } = {}) {
    this.endpoint = opts.endpoint ?? 'https://vision.googleapis.com/v1/images:annotate';
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async recognize(input: OcrInput): Promise<{ text: string; confidence: number }> {
    const apiKey = readSecret(EXPO_EXTRA_KEYS.google, ENV_KEYS.google);
    if (!apiKey) {
      throw new OcrUnavailable('GOOGLE_VISION_API_KEY missing');
    }
    if (!input.base64) {
      throw new OcrUnavailable('Google Vision requires base64 image content');
    }

    const url = `${this.endpoint}?key=${encodeURIComponent(apiKey)}`;
    const body = {
      requests: [
        {
          image: { content: input.base64 },
          features: [
            { type: 'DOCUMENT_TEXT_DETECTION' },
            { type: 'TEXT_DETECTION' },
          ],
          imageContext: { languageHints: ['en', 'ur'] },
        },
      ],
    };

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new OcrUnavailable(`Google Vision network error: ${(err as Error).message}`);
    }

    if (!res.ok) {
      throw new OcrUnavailable(`Google Vision HTTP ${res.status}`);
    }

    const json = (await res.json()) as GoogleVisionResponse;
    return parseGoogleVisionResponse(json);
  }
}

/**
 * Live Groq vision provider — issues a chat-completion request to a vision
 * model with the document as a base64 data URL. Groq does not return per-token
 * confidence, so we apply a conservative confidence heuristic: if the model
 * returned a non-trivial body, score 0.6 (just at the parser threshold);
 * else 0.2. The orchestrator's fallback path takes over for low/empty runs.
 *
 * Endpoint compatible with OpenAI's chat-completions schema:
 *   POST https://api.groq.com/openai/v1/chat/completions
 */
export class GroqVisionProvider implements OcrProvider {
  readonly name: OcrProviderName = 'groq';

  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { endpoint?: string; fetchImpl?: typeof fetch } = {}) {
    this.endpoint = opts.endpoint ?? 'https://api.groq.com/openai/v1/chat/completions';
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async recognize(input: OcrInput): Promise<{ text: string; confidence: number }> {
    const apiKey = readSecret(EXPO_EXTRA_KEYS.groq, ENV_KEYS.groq);
    if (!apiKey) {
      throw new OcrUnavailable('GROQ_API_KEY missing');
    }
    if (!input.base64) {
      throw new OcrUnavailable('Groq vision requires base64 image content');
    }

    const model = readSecret(EXPO_EXTRA_KEYS.groqModel, ENV_KEYS.groqModel)
      ?? 'llama-3.2-11b-vision-preview';

    const body = {
      model,
      temperature: 0,
      messages: [
        {
          role: 'user' as const,
          content: [
            {
              type: 'text' as const,
              text:
                'Extract the raw text from this document image as plain text. '
                + 'Return only the document text — no commentary, no markdown.',
            },
            {
              type: 'image_url' as const,
              image_url: { url: `data:image/jpeg;base64,${input.base64}` },
            },
          ],
        },
      ],
    };

    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new OcrUnavailable(`Groq network error: ${(err as Error).message}`);
    }

    if (!res.ok) {
      throw new OcrUnavailable(`Groq HTTP ${res.status}`);
    }

    const json = (await res.json()) as GroqChatCompletionResponse;
    return parseGroqResponse(json);
  }
}

type GroqChatCompletionResponse = {
  choices?: Array<{
    message?: { role?: string; content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string };
};

export function parseGroqResponse(json: GroqChatCompletionResponse): {
  text: string;
  confidence: number;
} {
  if (json.error) {
    throw new OcrUnavailable(json.error.message ?? 'Groq API error');
  }
  const text = (json.choices?.[0]?.message?.content ?? '').trim();
  // Groq does not surface per-token confidence; lean conservative.
  const confidence = text.length >= 20 ? 0.6 : 0.2;
  return { text, confidence };
}

type GoogleVisionPage = {
  confidence?: number;
  blocks?: Array<{
    confidence?: number;
    paragraphs?: Array<{
      confidence?: number;
      words?: Array<{
        confidence?: number;
        symbols?: Array<{ confidence?: number }>;
      }>;
    }>;
  }>;
};

type GoogleVisionResponse = {
  responses?: Array<{
    error?: { code?: number; message?: string };
    fullTextAnnotation?: {
      text?: string;
      pages?: GoogleVisionPage[];
    };
    textAnnotations?: Array<{ description?: string }>;
  }>;
};

/**
 * Pulled out of the class so the parser can be unit-tested directly without
 * standing up a fake fetch.
 */
export function parseGoogleVisionResponse(json: GoogleVisionResponse): {
  text: string;
  confidence: number;
} {
  const first = json.responses?.[0];
  if (first?.error) {
    throw new OcrUnavailable(first.error.message ?? 'Google Vision API error');
  }
  const annotation = first?.fullTextAnnotation;
  const text =
    annotation?.text
    ?? first?.textAnnotations?.[0]?.description
    ?? '';

  const confidence = computeAverageConfidence(annotation?.pages ?? []);
  return { text, confidence };
}

function computeAverageConfidence(pages: GoogleVisionPage[]): number {
  if (pages.length === 0) return 0.5;

  const pageScores = pages.map((p) => p.confidence).filter((c): c is number => typeof c === 'number');
  if (pageScores.length === pages.length && pageScores.length > 0) {
    return clamp01(avg(pageScores));
  }

  // Fall back to symbol-level confidences when page-level isn't reported.
  const symbolScores: number[] = [];
  for (const page of pages) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          for (const symbol of word.symbols ?? []) {
            if (typeof symbol.confidence === 'number') {
              symbolScores.push(symbol.confidence);
            }
          }
        }
      }
    }
  }

  if (symbolScores.length === 0) return 0.5;
  return clamp01(avg(symbolScores));
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function getOcrProvider(name?: OcrProviderName): OcrProvider {
  const preferred =
    name
    ?? ((readSecret(EXPO_EXTRA_KEYS.preferredProvider, ENV_KEYS.preferredProvider) as OcrProviderName | undefined))
    ?? 'google';
  switch (preferred) {
    case 'groq':
      return new GroqVisionProvider();
    case 'google':
    default:
      return new GoogleVisionProvider();
  }
}

/**
 * Test seam — accepts a synthetic provider so unit tests can exercise the
 * orchestration without spinning up real network calls.
 */
export function makeOcrProvider(custom: OcrProvider): OcrProvider {
  return custom;
}
