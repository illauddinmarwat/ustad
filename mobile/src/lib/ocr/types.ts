/**
 * OCR scaffold types (Phase 3, document assist).
 *
 * The pipeline is intentionally provider-agnostic. Real providers (Google
 * Vision, Groq Vision) plug in via the `OcrProvider` interface in
 * `providers.ts`. The scaffold returns `OcrResult` envelopes so downstream
 * consumers can branch on confidence and fall back to manual entry without
 * blocking the booking flow.
 */

export type DocType = 'cnic' | 'license' | 'other';

export type OcrProviderName = 'google' | 'groq';

export type OcrError =
  | 'provider_unavailable'
  | 'low_confidence'
  | 'parse_failed'
  | 'flag_disabled';

export type OcrResult =
  | {
      status: 'parsed';
      provider: OcrProviderName;
      confidence: number;
      text: string;
      fields: Record<string, string | null>;
    }
  | {
      status: 'manual_fallback';
      reason: OcrError;
      fields: Record<string, string | null>;
    }
  | {
      status: 'disabled';
    };

export type OcrInput = {
  doc: DocType;
  base64?: string;
  uri?: string;
};

export type OcrOptions = {
  preferredProvider?: OcrProviderName;
  minConfidence?: number;
};

export interface OcrProvider {
  readonly name: OcrProviderName;
  /**
   * Returns raw text + a 0..1 confidence score. Throws `OcrUnavailable` when
   * the provider cannot serve the request (missing key, network, etc).
   */
  recognize(input: OcrInput): Promise<{ text: string; confidence: number }>;
}

export class OcrUnavailable extends Error {
  constructor(message?: string) {
    super(message ?? 'OCR provider unavailable');
    this.name = 'OcrUnavailable';
  }
}
