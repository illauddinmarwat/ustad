import { Image } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';

/**
 * A friendly note about a photo, worked out on the phone from a small copy of it. It never blocks a photo and
 * nothing is sent anywhere: it only helps a person who took a dark or shaky picture to try again.
 */
export type QualityVerdict = 'good' | 'dark' | 'bright' | 'blurry' | 'small';

/** Shorter side below this many pixels is a small photo. */
export const MIN_SIDE_PX = 480;
const DARK_LUMA = 55;
const BRIGHT_LUMA = 225;
/** Variance of the Laplacian on a 128px-wide copy; sharp photos score far above this. */
const BLUR_VARIANCE = 18;
const SAMPLE_WIDTH = 128;

/** Brightness (0-255) and sharpness of RGBA pixels. */
export function measurePixels(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): { luma: number; sharpness: number } {
  const n = width * height;
  const gray = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const g = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    gray[i] = g;
    sum += g;
  }
  const luma = n ? sum / n : 0;

  // Laplacian: how much each pixel differs from its four neighbours. A blurred photo has little of it.
  let lapSum = 0;
  let lapSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      lapSum += lap;
      lapSq += lap * lap;
      count++;
    }
  }
  const mean = count ? lapSum / count : 0;
  const sharpness = count ? lapSq / count - mean * mean : 0;
  return { luma, sharpness };
}

/** The note for a photo of the given original size and measurements. Darkness is told first, then size, then blur. */
export function judge(size: { width: number; height: number }, m: { luma: number; sharpness: number }): QualityVerdict {
  if (m.luma < DARK_LUMA) return 'dark';
  if (m.luma > BRIGHT_LUMA) return 'bright';
  if (Math.min(size.width, size.height) < MIN_SIDE_PX) return 'small';
  if (m.sharpness < BLUR_VARIANCE) return 'blurry';
  return 'good';
}

const base64ToBytes = (b64: string): Uint8Array => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = chars.indexOf(clean[i]);
    const b = chars.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? chars.indexOf(clean[i + 2]) : -1;
    const d = i + 3 < clean.length ? chars.indexOf(clean[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
};

const sizeOf = (uri: string): Promise<{ width: number; height: number } | null> =>
  new Promise((resolve) => Image.getSize(uri, (width, height) => resolve({ width, height }), () => resolve(null)));

/** Look at a photo and say how good it is, or null when it could not be read (then no note is shown). */
export async function checkImageQuality(uri: string): Promise<QualityVerdict | null> {
  try {
    const size = await sizeOf(uri);
    const ref = await ImageManipulator.manipulate(uri).resize({ width: SAMPLE_WIDTH }).renderAsync();
    const small = await ref.saveAsync({ base64: true, compress: 0.9, format: SaveFormat.JPEG });
    if (!small.base64) return null;
    const img = decode(base64ToBytes(small.base64), { useTArray: true, formatAsRGBA: true });
    const m = measurePixels(img.data, img.width, img.height);
    // Without the original size, trust the copy: it is only as wide as the sample when the photo is that small.
    return judge(size ?? { width: img.width * 100, height: img.height * 100 }, m);
  } catch {
    return null;
  }
}
