jest.mock('expo-image-manipulator', () => ({
  __esModule: true,
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg' },
}));

import { computeResizePlan, preprocessForOcr, type PreprocessDeps } from './preprocess';

type ManipulateFn = NonNullable<PreprocessDeps['manipulate']>;

describe('computeResizePlan', () => {
  it('returns no-op when both dims under cap', () => {
    expect(computeResizePlan(800, 600, 1600)).toEqual({});
  });

  it('caps the longer edge — landscape', () => {
    expect(computeResizePlan(4000, 3000, 1600)).toEqual({ width: 1600 });
  });

  it('caps the longer edge — portrait', () => {
    expect(computeResizePlan(2000, 4000, 1600)).toEqual({ height: 1600 });
  });

  it('falls back to width-only resize when source dims unknown', () => {
    expect(computeResizePlan(null, null, 1200)).toEqual({ width: 1200 });
  });

  it('treats square images as landscape (deterministic)', () => {
    expect(computeResizePlan(2000, 2000, 1600)).toEqual({ width: 1600 });
  });
});

describe('preprocessForOcr', () => {
  it('returns base64 + uri from the injected manipulator', async () => {
    const manipulate = jest.fn<ReturnType<ManipulateFn>, Parameters<ManipulateFn>>(
      async () => ({
        uri: 'file:///tmp/processed.jpg',
        base64: 'AAAA',
        width: 1600,
        height: 1200,
      })
    );

    const out = await preprocessForOcr(
      { uri: 'file:///tmp/source.jpg', width: 4000, height: 3000 },
      {},
      { manipulate }
    );

    expect(out).toEqual({
      uri: 'file:///tmp/processed.jpg',
      base64: 'AAAA',
      width: 1600,
      height: 1200,
    });
    expect(manipulate).toHaveBeenCalledTimes(1);
    const passedOpts = manipulate.mock.calls[0][2];
    expect(passedOpts).toEqual({ maxEdgePx: 1600, jpegQuality: 0.7 });
  });

  it('honors custom options', async () => {
    const manipulate = jest.fn<ReturnType<ManipulateFn>, Parameters<ManipulateFn>>(
      async () => ({
        uri: 'file:///tmp/p.jpg',
        base64: 'BBBB',
        width: 800,
        height: 600,
      })
    );
    await preprocessForOcr(
      { uri: 'file:///tmp/source.jpg' },
      { maxEdgePx: 800, jpegQuality: 0.5 },
      { manipulate }
    );
    const passedOpts = manipulate.mock.calls[0][2];
    expect(passedOpts).toEqual({ maxEdgePx: 800, jpegQuality: 0.5 });
  });
});
