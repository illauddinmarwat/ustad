import { loadListingCards, loadListingPhotos, parseAreas, uploadListingPhoto, uploadListingPhotos, validateListing } from './listings';

const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockRpc = jest.fn();
const mockReadBody = jest.fn();

jest.mock('./workerUploads', () => ({ readBody: (...a: unknown[]) => mockReadBody(...a) }));
jest.mock('./supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => mockUpload(...a),
        remove: (...a: unknown[]) => mockRemove(...a),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/listing-media/${path}` } }),
      }),
    },
  },
}));

beforeEach(() => {
  [mockUpload, mockRemove, mockRpc, mockReadBody].forEach((m) => m.mockReset());
  mockReadBody.mockResolvedValue(new Uint8Array(1200));
  mockUpload.mockResolvedValue({ error: null });
  mockRemove.mockResolvedValue({ error: null });
});

describe('parseAreas', () => {
  it('splits on commas, new lines and the Urdu comma, trims, and drops duplicates', () => {
    expect(parseAreas('Gulshan,  North Nazimabad\ngulshan، DHA ,')).toEqual(['Gulshan', 'North Nazimabad', 'DHA']);
  });

  it('keeps at most ten areas and ignores very long names', () => {
    const many = Array.from({ length: 14 }, (_, i) => `Area ${i}`).join(',');
    expect(parseAreas(many)).toHaveLength(10);
    expect(parseAreas('x'.repeat(41))).toEqual([]);
  });
});

describe('validateListing', () => {
  const ok = { templateId: 't1', headline: 'Leak and tap repair', about: 'Mixers, pipes and flush tanks.', areas: 'Gulshan, DHA' };

  it('accepts a complete listing and returns the parsed areas', () => {
    expect(validateListing(ok)).toEqual({
      ok: true,
      value: { templateId: 't1', headline: 'Leak and tap repair', about: 'Mixers, pipes and flush tanks.', areas: ['Gulshan', 'DHA'] },
    });
  });

  it('asks for a service, headline and about text', () => {
    const r = validateListing({ templateId: '', headline: 'ab', about: 'short', areas: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['about', 'headline', 'templateId']);
  });

  it('refuses a phone number in any text field, including Urdu digits', () => {
    for (const bad of [
      { ...ok, about: 'Call 0300 1234567 any time' },
      { ...ok, headline: 'Call ۰۳۰۰۱۲۳۴۵۶۷ now' },
      { ...ok, areas: 'Gulshan, 03001234567' },
    ]) {
      const r = validateListing(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.contact).toBeTruthy();
    }
  });

  it('has no price field to validate', () => {
    expect(Object.keys(ok)).not.toContain('price');
  });
});

describe('uploadListingPhoto', () => {
  it('uploads under the worker and listing folders, then registers the photo', async () => {
    mockRpc.mockResolvedValue({ data: 'm1', error: null });
    await uploadListingPhoto('w1', 'l1', 'file://a.jpg');
    const path = mockUpload.mock.calls[0][0] as string;
    expect(path).toMatch(/^w1\/l1\/.+\.jpg$/);
    expect(mockRpc).toHaveBeenCalledWith('add_listing_media', { p_listing_id: 'l1', p_path: path, p_bytes: 1200 });
  });

  it('deletes the stored file when the server refuses to register it', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'limit reached: 4 photos per listing' } });
    await expect(uploadListingPhoto('w1', 'l1', 'file://a.jpg')).rejects.toThrow('limit reached');
    expect(mockRemove).toHaveBeenCalledWith([mockUpload.mock.calls[0][0]]);
  });

  it('counts failures instead of throwing when uploading several', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'm1', error: null }).mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect(await uploadListingPhotos('w1', 'l1', ['a', 'b'])).toEqual({ failed: 1 });
  });

  it('uploads at most four photos', async () => {
    mockRpc.mockResolvedValue({ data: 'm', error: null });
    await uploadListingPhotos('w1', 'l1', ['1', '2', '3', '4', '5', '6']);
    expect(mockUpload).toHaveBeenCalledTimes(4);
  });
});

describe('loadListingPhotos', () => {
  it('groups public URLs by listing in upload order', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { listing_id: 'l1', path: 'w/l1/a.jpg' },
        { listing_id: 'l2', path: 'w/l2/b.jpg' },
        { listing_id: 'l1', path: 'w/l1/c.jpg' },
      ],
      error: null,
    });
    expect(await loadListingPhotos(['l1', 'l2'])).toEqual({
      l1: ['https://cdn/listing-media/w/l1/a.jpg', 'https://cdn/listing-media/w/l1/c.jpg'],
      l2: ['https://cdn/listing-media/w/l2/b.jpg'],
    });
  });

  it('returns nothing for no ids or a failed call', async () => {
    expect(await loadListingPhotos([])).toEqual({});
    mockRpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await loadListingPhotos(['l1'])).toEqual({});
  });
});

describe('loadListingCards', () => {
  it('maps the card info by listing, turning the rating into a number', async () => {
    mockRpc.mockResolvedValue({
      data: [{ listing_id: 'l1', worker_name: 'Usman Khan', rating: '4.70', review_count: 12, verified: true, jobs_done: 25 }],
      error: null,
    });
    expect(await loadListingCards(['l1'])).toEqual({
      l1: { workerName: 'Usman Khan', rating: 4.7, reviewCount: 12, verified: true, jobsDone: 25 },
    });
    expect(mockRpc).toHaveBeenCalledWith('listing_card_info', { p_listing_ids: ['l1'] });
  });

  it('copes with a Ustad who has no rating yet', async () => {
    mockRpc.mockResolvedValue({ data: [{ listing_id: 'l2', worker_name: null, rating: null, review_count: null, verified: null, jobs_done: null }], error: null });
    expect(await loadListingCards(['l2'])).toEqual({ l2: { workerName: null, rating: null, reviewCount: 0, verified: false, jobsDone: 0 } });
  });

  it('returns nothing for no ids or a failed call', async () => {
    expect(await loadListingCards([])).toEqual({});
    mockRpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await loadListingCards(['l1'])).toEqual({});
  });
});
