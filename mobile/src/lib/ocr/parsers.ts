/**
 * Confidence-aware document field parsers for OCR scaffolding.
 *
 * Parsers are pure: they take recognized text + the provider's confidence
 * score and return a partial field map. When confidence is below the bar
 * they return `null` for fields they could not extract reliably so the
 * caller can fall back to manual entry.
 */

const DEFAULT_MIN_CONFIDENCE = 0.6;

export type ParsedFields = Record<string, string | null>;

const collapseWhitespace = (s: string) => s.replace(/\s+/g, ' ').trim();

const matchFirst = (text: string, pattern: RegExp): string | null => {
  const m = pattern.exec(text);
  return m ? m[0] : null;
};

/**
 * CNIC pattern (Pakistan): 13 digits, optionally written as `XXXXX-XXXXXXX-X`.
 * Returns the canonical hyphenated form when matched.
 */
export function parseCnicNumber(text: string): string | null {
  const compact = collapseWhitespace(text).replace(/\u200f|\u200e/g, '');
  const hyphenated = matchFirst(compact, /\b\d{5}-\d{7}-\d\b/);
  if (hyphenated) return hyphenated;
  const flat = matchFirst(compact, /\b\d{13}\b/);
  if (!flat) return null;
  return `${flat.slice(0, 5)}-${flat.slice(5, 12)}-${flat.slice(12)}`;
}

/**
 * Driving licence number heuristic — a contiguous alphanumeric string of
 * at least 8 characters that contains both letters and digits. Loose on
 * purpose; the goal is to assist worker pre-fill, not authoritative parsing.
 */
export function parseLicenseNumber(text: string): string | null {
  const tokens = collapseWhitespace(text).split(/[\s,;]+/);
  for (const token of tokens) {
    if (token.length < 8) continue;
    if (!/[A-Za-z]/.test(token)) continue;
    if (!/\d/.test(token)) continue;
    if (/^[A-Za-z0-9-]+$/.test(token)) return token.toUpperCase();
  }
  return null;
}

/**
 * Returns the first plausible name line (≥ 2 capitalized tokens). Used as a
 * weak hint only — UI must let the user edit.
 */
export function parseDisplayName(text: string): string | null {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 2) continue;
    const capitalized = tokens.filter((t) => /^[A-Z][A-Za-z]+$/.test(t));
    if (capitalized.length >= 2) return capitalized.slice(0, 4).join(' ');
  }
  return null;
}

export type ParseDocumentArgs = {
  doc: 'cnic' | 'license' | 'other';
  text: string;
  confidence: number;
  minConfidence?: number;
};

export type ParseDocumentResult = {
  fields: ParsedFields;
  confidence: number;
  acceptable: boolean;
};

/**
 * Top-level parser dispatch. Even when overall confidence is below the
 * threshold we still return whatever fields matched so the caller can show
 * "we got this much, please correct" rather than a hard fail.
 */
export function parseDocument({
  doc,
  text,
  confidence,
  minConfidence = DEFAULT_MIN_CONFIDENCE,
}: ParseDocumentArgs): ParseDocumentResult {
  const fields: ParsedFields = {};

  if (doc === 'cnic') {
    fields.cnic_number = parseCnicNumber(text);
    fields.holder_name = parseDisplayName(text);
  } else if (doc === 'license') {
    fields.license_number = parseLicenseNumber(text);
    fields.holder_name = parseDisplayName(text);
  } else {
    fields.holder_name = parseDisplayName(text);
  }

  const acceptable =
    confidence >= minConfidence
    && Object.values(fields).some((v) => v !== null);

  return { fields, confidence, acceptable };
}

export const OCR_DEFAULT_MIN_CONFIDENCE = DEFAULT_MIN_CONFIDENCE;
