/** Looping and entrance animations are skipped under Jest, where they only add noise and open handles. */
export const motionEnabled = typeof process === 'undefined' || !process.env?.JEST_WORKER_ID;
