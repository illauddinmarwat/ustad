/**
 * OCR scaffold orchestrator (Phase 3, document assist).
 *
 * Responsibilities:
 *   - gate the pipeline behind `phase3_ocr_enabled`,
 *   - run the recognizer through an ordered provider chain,
 *   - apply the confidence-aware parser,
 *   - fall back to manual entry if anything fails.
 *
 * The orchestrator NEVER throws — it returns a discriminated `OcrResult`
 * envelope so callers (worker onboarding screens, future) can branch on
 * `status` and prefill what they have without ever blocking the booking
 * flow. Per the Phase 3 doc, OCR is "assist" only.
 *
 * Provider chain (Phase 3 slice 3a):
 *   Default order is determined by `VISION_PROVIDER` env (or 'google'),
 *   then the secondary provider is appended. Each provider attempt:
 *     - OcrUnavailable / network / HTTP error  → try next provider.
 *     - Successful recognise but low confidence → try next provider for a
 *       potentially better signal; if none beats the bar, fall back to
 *       manual entry with the best-effort fields prefilled.
 */

import { fetchPhase3Flags } from '../featureFlags';
import { OCR_DEFAULT_MIN_CONFIDENCE, parseDocument, type ParsedFields } from './parsers';
import { getOcrProvider } from './providers';
import {
  OcrUnavailable,
  type OcrInput,
  type OcrOptions,
  type OcrProvider,
  type OcrProviderName,
  type OcrResult,
} from './types';

const EMPTY_FIELDS: ParsedFields = {};

const DEFAULT_CHAIN: OcrProviderName[] = ['google', 'groq'];

export type ExtractDocumentDeps = {
  /** Override the flag fetch (used by tests). */
  isOcrEnabled?: () => Promise<boolean>;
  /** Override the provider factory (used by tests). */
  resolveProvider?: (name: OcrProviderName) => OcrProvider;
  /** Override the chain order (used by tests). */
  resolveChain?: (preferred?: OcrProviderName) => OcrProviderName[];
};

export async function extractDocument(
  input: OcrInput,
  options: OcrOptions = {},
  deps: ExtractDocumentDeps = {}
): Promise<OcrResult> {
  const isOcrEnabled =
    deps.isOcrEnabled ?? (async () => (await fetchPhase3Flags()).ocrEnabled);
  const resolveProvider =
    deps.resolveProvider ?? ((name: OcrProviderName) => getOcrProvider(name));
  const resolveChain = deps.resolveChain ?? defaultChain;

  const enabled = await isOcrEnabled();
  if (!enabled) {
    return { status: 'disabled' };
  }

  const chain = resolveChain(options.preferredProvider);
  const minConfidence = options.minConfidence ?? OCR_DEFAULT_MIN_CONFIDENCE;

  let bestPartial: { fields: ParsedFields; reason: 'low_confidence' | 'parse_failed' } | null = null;
  let lastReason: 'low_confidence' | 'parse_failed' | 'provider_unavailable' = 'provider_unavailable';

  for (const providerName of chain) {
    let provider: OcrProvider;
    try {
      provider = resolveProvider(providerName);
    } catch {
      lastReason = 'provider_unavailable';
      continue;
    }

    let recognized: { text: string; confidence: number };
    try {
      recognized = await provider.recognize(input);
    } catch (err) {
      lastReason = err instanceof OcrUnavailable ? 'provider_unavailable' : 'parse_failed';
      continue;
    }

    const parsed = parseDocument({
      doc: input.doc,
      text: recognized.text,
      confidence: recognized.confidence,
      minConfidence,
    });

    if (parsed.acceptable) {
      return {
        status: 'parsed',
        provider: provider.name,
        confidence: recognized.confidence,
        text: recognized.text,
        fields: parsed.fields,
      };
    }

    // Track best partial in case every provider falls short — gives the
    // worker something to edit instead of a blank form.
    if (Object.values(parsed.fields).some((v) => v !== null)) {
      bestPartial = {
        fields: parsed.fields,
        reason: recognized.confidence < minConfidence ? 'low_confidence' : 'parse_failed',
      };
    }
    lastReason = recognized.confidence < minConfidence ? 'low_confidence' : 'parse_failed';
  }

  if (bestPartial) {
    return { status: 'manual_fallback', reason: bestPartial.reason, fields: bestPartial.fields };
  }
  return { status: 'manual_fallback', reason: lastReason, fields: EMPTY_FIELDS };
}

function defaultChain(preferred?: OcrProviderName): OcrProviderName[] {
  if (!preferred) return DEFAULT_CHAIN;
  // Caller-preferred provider first, then the rest of the default chain.
  const rest = DEFAULT_CHAIN.filter((p) => p !== preferred);
  return [preferred, ...rest];
}

export type { OcrResult, OcrInput, OcrOptions } from './types';
export { OCR_ENV_KEY_NAMES } from './providers';
