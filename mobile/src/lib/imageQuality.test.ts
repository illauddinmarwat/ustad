import { judge, measurePixels } from './imageQuality';

const solid = (w: number, h: number, v: number) => {
  const a = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) a.set([v, v, v, 255], i * 4);
  return a;
};

// A photo full of edges: a checkerboard of dark and light squares.
const checker = (w: number, h: number) => {
  const a = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = (x + y) % 2 === 0 ? 40 : 200;
      a.set([v, v, v, 255], (y * w + x) * 4);
    }
  return a;
};

const BIG = { width: 1600, height: 1200 };

describe('measurePixels and judge', () => {
  it('calls a sharp, well lit photo good', () => {
    const m = measurePixels(checker(32, 32), 32, 32);
    expect(m.luma).toBeCloseTo(120, 0);
    expect(judge(BIG, m)).toBe('good');
  });

  it('says dark for a photo that is nearly black, and bright for one that is nearly white', () => {
    expect(judge(BIG, measurePixels(solid(32, 32, 20), 32, 32))).toBe('dark');
    expect(judge(BIG, measurePixels(solid(32, 32, 250), 32, 32))).toBe('bright');
  });

  it('says blurry for a flat photo with no edges at a normal brightness', () => {
    expect(judge(BIG, measurePixels(solid(32, 32, 130), 32, 32))).toBe('blurry');
  });

  it('says small for a photo with a short side under 480 pixels', () => {
    expect(judge({ width: 640, height: 400 }, measurePixels(checker(32, 32), 32, 32))).toBe('small');
  });

  it('tells about darkness before size', () => {
    expect(judge({ width: 200, height: 200 }, { luma: 10, sharpness: 500 })).toBe('dark');
  });
});
