// Activity outcomes are explicit. Only a completed activity is rewarded:
// XP, memory, souvenir, photo, thanks, plan completion and the time advance.
// Pure logic (no three.js) so node tests can cover it.

export const COMPLETED = 'completed';
export const FAILED = 'failed';
export const CANCELLED = 'cancelled';

/**
 * Normalise what an activity's play() returned (or threw).
 * - an object without `status` is a completed activity (older activities);
 * - `status: 'cancelled'` or `'failed'` is kept;
 * - null / undefined / non-objects are failures (nothing to reward);
 * - a thrown error is a failure.
 */
export function activityOutcome(result, error = null) {
  if (error) return { status: FAILED, detail: {}, error: String(error?.message || error) };
  if (!result || typeof result !== 'object') return { status: FAILED, detail: {}, error: 'no-result' };
  const status = [COMPLETED, FAILED, CANCELLED].includes(result.status) ? result.status : (result.error ? FAILED : COMPLETED);
  return { ...result, status, detail: result.detail && typeof result.detail === 'object' ? result.detail : {} };
}

export const rewardable = (outcome) => outcome?.status === COMPLETED;
