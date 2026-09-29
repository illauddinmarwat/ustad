import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { computeResizePlan } from './ocr/preprocess';

export type ImageSource = 'camera' | 'gallery';

export type PickResult =
  | { status: 'ok'; uri: string }
  | { status: 'canceled' }
  | { status: 'denied' };

const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.7;

/** Pick from gallery or camera and shrink the result (max edge 1600px, JPEG 0.7, no base64). */
export async function pickImage(source: ImageSource): Promise<PickResult> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return { status: 'canceled' };

  const asset = result.assets[0];
  try {
    const plan = computeResizePlan(asset.width, asset.height, MAX_EDGE_PX);
    let context = ImageManipulator.manipulate(asset.uri);
    if (plan.width || plan.height) {
      context = context.resize({ width: plan.width ?? null, height: plan.height ?? null });
    }
    const ref = await context.renderAsync();
    const saved = await ref.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
    return { status: 'ok', uri: saved.uri };
  } catch {
    return { status: 'ok', uri: asset.uri };
  }
}
