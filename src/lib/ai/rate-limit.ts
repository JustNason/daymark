const windows = new Map<string, number[]>();
const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 60 * 60 * 1000;

/** Best-effort per-instance cap; provider input and output are also bounded. */
export function consumeAIRequest(userId: string, now = Date.now()) {
  const recent = (windows.get(userId) || []).filter(
    (time) => now - time < RATE_WINDOW_MS,
  );
  if (recent.length >= RATE_LIMIT) return false;
  recent.push(now);
  windows.set(userId, recent);
  if (windows.size > 10_000) {
    for (const [key, times] of windows) {
      if (!times.some((time) => now - time < RATE_WINDOW_MS))
        windows.delete(key);
      if (windows.size <= 8_000) break;
    }
  }
  return true;
}
