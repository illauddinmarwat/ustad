import { createAudioPlayer } from 'expo-audio';
import { Platform, Vibration } from 'react-native';

let player: ReturnType<typeof createAudioPlayer> | null = null;

/** A short beep and buzz for something that just changed on the open job page. Never throws. */
export function playAlert(): void {
  try {
    if (Platform.OS !== 'web') Vibration.vibrate([0, 200, 100, 200]);
    if (!player) player = createAudioPlayer(require('../../assets/sounds/ping.wav'));
    void player.seekTo(0);
    player.play();
  } catch {
    // No audio device or the module is unavailable: the visual update still happens.
  }
}
