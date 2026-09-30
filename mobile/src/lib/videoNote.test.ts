import {
  clockElapsed,
  clockPause,
  clockStart,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  videoContentType,
  videoExtension,
  videoSecondsFromMillis,
} from './videoNote';

describe('video helpers', () => {
  it('rounds to whole seconds within 1 and the cap', () => {
    expect(videoSecondsFromMillis(0)).toBe(1);
    expect(videoSecondsFromMillis(8_400)).toBe(8);
    expect(videoSecondsFromMillis(8_600)).toBe(9);
    expect(videoSecondsFromMillis(31_000)).toBe(MAX_VIDEO_SECONDS);
  });

  it('picks the upload type from the file extension', () => {
    expect(videoContentType('file:///a.mp4')).toBe('video/mp4');
    expect(videoContentType('file:///a.MOV')).toBe('video/quicktime');
    expect(videoContentType('file:///a.3gp')).toBe('video/3gpp');
    expect(videoContentType('blob:https://x/y.webm?z=1')).toBe('video/webm');
    expect(videoContentType('file:///noextension')).toBe('video/mp4');
  });

  it('keeps a safe extension', () => {
    expect(videoExtension('file:///a.MOV')).toBe('mov');
    expect(videoExtension('file:///a.weirdlongext')).toBe('mp4');
  });

  it('stays under the server limit of 25 MiB', () => {
    expect(MAX_VIDEO_BYTES).toBeLessThan(25 * 1024 * 1024);
  });
});

describe('recording clock', () => {
  it('counts recorded time and skips paused stretches', () => {
    let c = clockStart({ accumulatedMs: 0, segmentStart: null }, 1_000);
    expect(clockElapsed(c, 6_000)).toBe(5_000);
    c = clockPause(c, 6_000);
    expect(clockElapsed(c, 16_000)).toBe(5_000);
    c = clockStart(c, 16_000);
    expect(clockElapsed(c, 19_000)).toBe(8_000);
  });

  it('pausing twice does not add time', () => {
    const c = clockPause(clockStart({ accumulatedMs: 0, segmentStart: null }, 0), 4_000);
    expect(clockPause(c, 9_000).accumulatedMs).toBe(4_000);
  });
});
