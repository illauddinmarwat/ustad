import { fetchFinalPrice, parseFinalPrice, proposeFinalPrice, respondFinalPrice } from './finalPrice';

const mockRpc = jest.fn();
jest.mock('./supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

beforeEach(() => mockRpc.mockReset());

describe('parseFinalPrice', () => {
  it('reads the row for a customer', () => {
    expect(
      parseFinalPrice([{ is_estimate: true, status: 'proposed', amount_pkr: 230, customer_price_pkr: 230, attempts: 1, viewer: 'customer' }]),
    ).toEqual({ isEstimate: true, status: 'proposed', amount: 230, customerPrice: 230, attempts: 1, viewer: 'customer' });
  });

  it('keeps the worker own price apart from the customer price', () => {
    const info = parseFinalPrice({ is_estimate: true, status: 'confirmed', amount_pkr: 200, customer_price_pkr: 230, attempts: 2, viewer: 'worker' });
    expect(info?.amount).toBe(200);
    expect(info?.customerPrice).toBe(230);
    expect(info?.viewer).toBe('worker');
  });

  it('treats missing numbers as null and unknown statuses as none', () => {
    const info = parseFinalPrice([{ is_estimate: false, status: 'weird', amount_pkr: null }]);
    expect(info).toMatchObject({ isEstimate: false, status: 'none', amount: null, customerPrice: null, attempts: 0 });
  });

  it('returns null when there is no row', () => {
    expect(parseFinalPrice([])).toBeNull();
    expect(parseFinalPrice(null)).toBeNull();
  });
});

describe('server calls', () => {
  it('fetches the final price for a job', async () => {
    mockRpc.mockResolvedValue({ data: [{ is_estimate: true, status: 'none', attempts: 0, viewer: 'customer' }], error: null });
    const info = await fetchFinalPrice('j1');
    expect(mockRpc).toHaveBeenCalledWith('job_final_price', { p_job_id: 'j1' });
    expect(info?.status).toBe('none');
  });

  it('returns null when the call fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await fetchFinalPrice('j1')).toBeNull();
    mockRpc.mockRejectedValue(new Error('offline'));
    expect(await fetchFinalPrice('j1')).toBeNull();
  });

  it('proposes and answers, returning the server message on failure', async () => {
    mockRpc.mockResolvedValue({ data: 230, error: null });
    expect(await proposeFinalPrice('j1', 200)).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('worker_set_final_price', { p_job_id: 'j1', p_amount_pkr: 200 });

    mockRpc.mockResolvedValue({ data: null, error: { message: 'the final price is already confirmed' } });
    expect(await proposeFinalPrice('j1', 150)).toBe('the final price is already confirmed');

    mockRpc.mockResolvedValue({ data: 'confirmed', error: null });
    expect(await respondFinalPrice('j1', true)).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('customer_respond_final_price', { p_job_id: 'j1', p_accept: true });
  });
});
