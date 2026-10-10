// An in-memory stand-in for the backend, shared by both phones in the job-flow demo.
type Row = Record<string, unknown>;
type Listener = { table: string; cb: (p: { eventType: string; new: Row }) => void };

export const CUSTOMER_ID = 'c-demo';
export const WORKER_ID = 'w-demo';

const initialJob = (): Row => ({
  id: 'demo',
  title: 'Fix leaking kitchen tap',
  description: 'The mixer tap drips all night and the base is loose. Needs a new cartridge.',
  status: 'assigned',
  origin: 'customer_job',
  customer_id: CUSTOMER_ID,
  worker_id: WORKER_ID,
  category: 'plumber',
  location_text: 'DHA Phase 5, Lahore',
  worker_done_at: null,
  completion_note: null,
});

class Store {
  job: Row = initialJob();
  messages: Row[] = [];
  realtime: Row | null = null;
  review: Row | null = null;
  listeners = new Set<Listener>();

  reset() {
    this.job = initialJob();
    this.messages = [];
    this.realtime = null;
    this.review = null;
    this.emit('jobs', 'UPDATE', this.job);
  }

  emit(table: string, eventType: string, row: Row) {
    this.listeners.forEach((l) => l.table === table && l.cb({ eventType, new: row }));
  }

  patchJob(patch: Row) {
    this.job = { ...this.job, ...patch };
    this.emit('jobs', 'UPDATE', this.job);
  }

  rpc(fn: string, args: Row): { data: unknown; error: { message: string } | null } {
    const ok = (data: unknown = null) => ({ data, error: null });
    switch (fn) {
      case 'worker_mark_work_done':
        this.patchJob({ worker_done_at: new Date().toISOString(), completion_note: null });
        if (this.realtime) {
          this.realtime = { ...this.realtime, is_en_route: false };
          this.emit('job_realtime_states', 'UPDATE', this.realtime);
        }
        return ok();
      case 'customer_reject_completion':
        this.patchJob({ worker_done_at: null, completion_note: (args.p_note as string) || 'Please look at it again.' });
        return ok();
      case 'mark_job_completed':
        this.patchJob({ status: 'completed' });
        return ok();
      case 'mark_job_paid':
        this.patchJob({ status: 'payment_pending' });
        return ok();
      case 'worker_confirm_payment_received':
        this.patchJob({ status: 'closed' });
        return ok();
      case 'worker_set_job_realtime_state':
        this.realtime = {
          is_en_route: args.p_is_en_route ?? this.realtime?.is_en_route ?? false,
          eta_bucket: args.p_is_en_route ? '30m' : null,
          timer_started_at: null,
          timer_accum_seconds: 0,
          started_work_at: null,
          lat: 31.48,
          lng: 74.4,
        };
        this.emit('job_realtime_states', 'UPDATE', this.realtime);
        return ok();
      case 'get_job_contacts':
        return ok([
          { worker_phone: '0300 1234567', customer_phone: '0321 7654321', customer_address: 'House 12, Street 4, DHA Phase 5', contact_shared: true },
        ]);
      case 'job_final_price':
        return ok([{ is_estimate: false, status: 'none', viewer: 'customer' }]);
      default:
        return ok();
    }
  }
}

export const store = new Store();
