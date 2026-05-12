/**
 * Image preprocessing for OCR (Phase 3 slice 3d).
 *
 * Goals:
 *   - Cap image dimensions so the base64 payload stays small enough for
 *     mobile uploads and the Vision API quotas behave (max edge ~1600 px).
 *   - JPEG-compress at ~0.7 quality — strong accuracy/size tradeoff for
 *     CNIC / driving licence photos taken on a phone camera.
 *   - Return base64 + uri so the existing onboarding flow can swap the raw
 *     pick result for the preprocessed one without other UI changes.
 *
 * The implementation is intentionally split from the screen so it can be
 * unit-tested with an injected manipulator.
 */

import {
  ImageManipulator,
  SaveFormat,
  type ImageResult,
} from 'expo-image-manipulator';

export type PreprocessOptions = {
  maxEdgePx?: number;
  jpegQuality?: number;
};

export type PreprocessResult = {
  uri: string;
  base64: string | null;
  width: number;
  height: number;
};

export type PreprocessDeps = {
  /** Pure function that drives the manipulation; injectable for tests. */
  manipulate?: (
    uri: string,
    sourceWidth: number | null,
    options: Required<PreprocessOptions>
  ) => Promise<ImageResult>;
};

const DEFAULTS: Required<PreprocessOptions> = {
  maxEdgePx: 1600,
  jpegQuality: 0.7,
};

/**
 * Compute the resize plan: keep aspect ratio, cap on the longer edge.
 * Pure helper, exported so it can be tested directly.
 */
export function computeResizePlan(
  sourceWidth: number | null,
  sourceHeight: number | null,
  maxEdgePx: number
): { width?: number; height?: number } {
  if (!sourceWidth || !sourceHeight) {
    return { width: maxEdgePx };
  }
  if (sourceWidth <= maxEdgePx && sourceHeight <= maxEdgePx) {
    return {};
  }
  if (sourceWidth >= sourceHeight) {
    return { width: maxEdgePx };
  }
  return { height: maxEdgePx };
}

const defaultManipulate = async (
  uri: string,
  sourceWidth: number | null,
  options: Required<PreprocessOptions>
): Promise<ImageResult> => {
  const plan = computeResizePlan(sourceWidth, sourceWidth, options.maxEdgePx);

  let context = ImageManipulator.manipulate(uri);
  if (plan.width || plan.height) {
    context = context.resize({ width: plan.width ?? null, height: plan.height ?? null });
  }
  const ref = await context.renderAsync();
  return ref.saveAsync({
    base64: true,
    compress: options.jpegQuality,
    format: SaveFormat.JPEG,
  });
};

export async function preprocessForOcr(
  source: { uri: string; width?: number | null; height?: number | null; base64?: string | null },
  options: PreprocessOptions = {},
  deps: PreprocessDeps = {}
): Promise<PreprocessResult> {
  const opts = { ...DEFAULTS, ...options };
  const fn = deps.manipulate ?? defaultManipulate;
  const result = await fn(source.uri, source.width ?? null, opts);

  return {
    uri: result.uri,
    base64: result.base64 ?? null,
    width: result.width,
    height: result.height,
  };
}
