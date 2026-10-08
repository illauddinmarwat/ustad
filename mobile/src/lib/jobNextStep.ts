import type { StringId } from '../i18n/strings';

export type NextAction = 'confirmBooking' | 'markComplete' | 'workDone' | 'startEnRoute' | 'arrived';

export type NextStep = {
  action: NextAction;
  labelId: StringId;
  icon: 'check' | 'check-circle' | 'navigation' | 'map-pin';
  variant: 'primary' | 'success';
  /** A second, quieter button under the main one (Work done stays reachable while on the way or before leaving). */
  also?: NextStep;
};

type Input = {
  viewer: 'customer' | 'worker';
  status: string;
  origin: string;
  workerDone: boolean;
  /** Live on-the-way tracking is switched on for this app. */
  realtime: boolean;
  enRoute: boolean;
  startedWork: boolean;
  /** A live-status row exists: the Ustad has already pressed on the way, arrived or the timer at least once. */
  tracked: boolean;
};

/** The one thing this person should do next on a job, shown as the pinned button. null when they are just waiting. */
export function nextStep(i: Input): NextStep | null {
  if (i.viewer === 'customer') {
    if (i.status === 'pending_customer_confirm' && i.origin === 'service_listing') {
      return { action: 'confirmBooking', labelId: 'jobDetail.confirm.cta', icon: 'check', variant: 'primary' };
    }
    if (i.status === 'assigned') {
      return {
        action: 'markComplete',
        labelId: i.workerDone ? 'jobDetail.confirmDone.yes' : 'jobDetail.complete.cta',
        icon: 'check-circle',
        variant: 'success',
      };
    }
    return null;
  }
  if (i.status !== 'assigned' || i.workerDone) return null;
  const workDone: NextStep = { action: 'workDone', labelId: 'jobDetail.workDone.cta', icon: 'check-circle', variant: 'success' };
  if (i.realtime) {
    // Pressing Arrived stops en-route but leaves no other trace, so "a row exists and not en route" means arrived.
    if (i.enRoute) {
      return { action: 'arrived', labelId: 'jobDetail.timeline.arrived', icon: 'map-pin', variant: 'primary', also: workDone };
    }
    if (!i.tracked && !i.startedWork) {
      return {
        action: 'startEnRoute',
        labelId: 'jobDetail.timeline.startEnRoute',
        icon: 'navigation',
        variant: 'primary',
        also: workDone,
      };
    }
  }
  return workDone;
}
