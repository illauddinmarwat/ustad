import { audioContentType, audioExtension, formatClock, MAX_AUDIO_SECONDS, secondsFromMillis, VOICE_RECORDING_OPTIONS } from './voiceNote';

describe('voice note helpers', () => {
  it('rounds to whole seconds within 1 and the cap', () => {
    expect(secondsFromMillis(0)).toBe(1);
    expect(secondsFromMillis(400)).toBe(1);
    expect(secondsFromMillis(12_400)).toBe(12);
    expect(secondsFromMillis(12_600)).toBe(13);
    expect(secondsFromMillis(61_000)).toBe(MAX_AUDIO_SECONDS);
  });

  it('formats a clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(7.9)).toBe('0:07');
    expect(formatClock(60)).toBe('1:00');
    expect(formatClock(-3)).toBe('0:00');
  });

  it('picks the upload type from the file extension', () => {
    expect(audioContentType('file:///a.m4a')).toBe('audio/mp4');
    expect(audioContentType('file:///a.3gp')).toBe('audio/3gpp');
    expect(audioContentType('blob:https://x/y.webm?z=1')).toBe('audio/webm');
    expect(audioContentType('file:///noextension')).toBe('audio/mp4');
  });

  it('keeps a safe extension', () => {
    expect(audioExtension('file:///a.M4A')).toBe('m4a');
    expect(audioExtension('file:///a.webm?x=1')).toBe('webm');
    expect(audioExtension('file:///a.weirdlongext')).toBe('m4a');
  });

  it('records mono at a small bitrate', () => {
    expect(VOICE_RECORDING_OPTIONS.numberOfChannels).toBe(1);
    expect(VOICE_RECORDING_OPTIONS.bitRate).toBeLessThanOrEqual(64000);
  });
});
