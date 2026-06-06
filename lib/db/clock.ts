let lastStamp = 0;

/** Monotonic clock for updatedAt: never goes backwards within a session (sync cursors depend on it). */
export function syncClock(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}
