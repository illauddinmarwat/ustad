jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        googleVisionApiKey: 'test-key',
        groqApiKey: 'groq-test-key',
        groqVisionModel: 'test-vision-model',
      },
    },
  },
}));

import {
  GoogleVisionProvider,
  GroqVisionProvider,
  parseGoogleVisionResponse,
  parseGroqResponse,
} from './providers';
import { OcrUnavailable } from './types';

describe('GoogleVisionProvider response parser', () => {
  it('extracts fullTextAnnotation text and averages page confidence', () => {
    const result = parseGoogleVisionResponse({
      responses: [
        {
          fullTextAnnotation: {
            text: '35202-1234567-8\nAli',
            pages: [{ confidence: 0.9 }, { confidence: 0.7 }],
          },
        },
      ],
    });
    expect(result.text).toBe('35202-1234567-8\nAli');
    expect(result.confidence).toBeCloseTo(0.8, 5);
  });

  it('falls back to first textAnnotation description when fullText missing', () => {
    const result = parseGoogleVisionResponse({
      responses: [
        {
          textAnnotations: [{ description: 'fallback text' }],
        },
      ],
    });
    expect(result.text).toBe('fallback text');
    // Default confidence when nothing reported
    expect(result.confidence).toBeCloseTo(0.5, 5);
  });

  it('uses symbol-level confidence when page confidence missing', () => {
    const result = parseGoogleVisionResponse({
      responses: [
        {
          fullTextAnnotation: {
            text: 'X',
            pages: [
              {
                blocks: [
                  {
                    paragraphs: [
                      {
                        words: [
                          {
                            symbols: [
                              { confidence: 0.6 },
                              { confidence: 0.8 },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    expect(result.confidence).toBeCloseTo(0.7, 5);
  });

  it('throws OcrUnavailable on API error response', () => {
    expect(() =>
      parseGoogleVisionResponse({
        responses: [{ error: { code: 7, message: 'Permission denied' } }],
      })
    ).toThrow(OcrUnavailable);
  });
});

describe('GoogleVisionProvider request flow', () => {
  it('hits the v1 annotate endpoint with TEXT detection features and the api key', async () => {
    const fakeFetch: jest.Mock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        responses: [
          {
            fullTextAnnotation: {
              text: 'License No: ABC123XYZ',
              pages: [{ confidence: 0.95 }],
            },
          },
        ],
      }),
    }));

    const provider = new GoogleVisionProvider({
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    const result = await provider.recognize({ doc: 'license', base64: 'aGVsbG8=' });

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, init] = fakeFetch.mock.calls[0];
    expect(typeof url).toBe('string');
    expect(url as string).toMatch(/vision\.googleapis\.com\/v1\/images:annotate\?key=test-key/);
    expect((init as RequestInit).method).toBe('POST');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.requests[0].image.content).toBe('aGVsbG8=');
    expect(body.requests[0].features.map((f: { type: string }) => f.type)).toEqual([
      'DOCUMENT_TEXT_DETECTION',
      'TEXT_DETECTION',
    ]);
    expect(result.text).toContain('ABC123XYZ');
    expect(result.confidence).toBeCloseTo(0.95, 5);
  });

  it('translates HTTP failures into OcrUnavailable', async () => {
    const provider = new GoogleVisionProvider({
      fetchImpl: (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch,
    });
    await expect(provider.recognize({ doc: 'cnic', base64: 'aGk=' })).rejects.toBeInstanceOf(
      OcrUnavailable
    );
  });

  it('rejects requests without base64 image content', async () => {
    const provider = new GoogleVisionProvider({
      fetchImpl: (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch,
    });
    await expect(provider.recognize({ doc: 'cnic' })).rejects.toBeInstanceOf(OcrUnavailable);
  });
});

describe('GroqVisionProvider response parser', () => {
  it('returns the chat completion text and a conservative confidence', () => {
    const out = parseGroqResponse({
      choices: [{ message: { content: 'License No: ABC123XYZ\nName: Ali' } }],
    });
    expect(out.text).toContain('ABC123XYZ');
    expect(out.confidence).toBeGreaterThan(0.4);
    expect(out.confidence).toBeLessThan(1);
  });

  it('lowers confidence for empty content', () => {
    const out = parseGroqResponse({ choices: [{ message: { content: '' } }] });
    expect(out.confidence).toBeLessThan(0.5);
  });

  it('throws OcrUnavailable on api error', () => {
    expect(() => parseGroqResponse({ error: { message: 'rate limited' } })).toThrow(
      OcrUnavailable
    );
  });
});

describe('GroqVisionProvider request flow', () => {
  it('posts a chat-completions vision message with bearer auth', async () => {
    const fakeFetch: jest.Mock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'License No: ABC123XYZ — Ali Khan' } }],
      }),
    }));
    const provider = new GroqVisionProvider({ fetchImpl: fakeFetch as unknown as typeof fetch });
    const out = await provider.recognize({ doc: 'license', base64: 'aGVsbG8=' });

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, init] = fakeFetch.mock.calls[0];
    expect(url).toMatch(/api\.groq\.com\/openai\/v1\/chat\/completions$/);
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer groq-test-key');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('test-vision-model');
    expect(body.messages[0].content[1].image_url.url).toContain('aGVsbG8=');
    expect(out.text).toContain('ABC123XYZ');
  });

  it('translates HTTP failures into OcrUnavailable', async () => {
    const provider = new GroqVisionProvider({
      fetchImpl: (async () => ({ ok: false, status: 429 })) as unknown as typeof fetch,
    });
    await expect(provider.recognize({ doc: 'cnic', base64: 'aGk=' })).rejects.toBeInstanceOf(
      OcrUnavailable
    );
  });
});
