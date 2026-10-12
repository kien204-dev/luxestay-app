// Reads the API's rate limit headers (express-rate-limit, IETF draft 8):
//   RateLimit: "5-in-1hrs"; r=4; t=3599   (r = requests left, t = seconds
//   until the window resets), and Retry-After on a refused request.
// Returns { remaining, resetAt } (resetAt in ms since epoch), or null when
// the response carries neither (a proxy dropped them, or tests switch the
// limits off).
export function readRateLimit(response, now = Date.now()) {
  const headers = response?.headers;
  if (!headers) return null;
  const header = String(headers.ratelimit || headers.RateLimit || "");
  const remaining = header.match(/(?:^|;)\s*r=(\d+)/);
  const reset = header.match(/(?:^|;)\s*t=(\d+)/);
  const retryAfter = Number(headers["retry-after"]);

  if (remaining && reset) return { remaining: Number(remaining[1]), resetAt: now + Number(reset[1]) * 1000 };
  if (response.status === 429 && Number.isFinite(retryAfter)) return { remaining: 0, resetAt: now + retryAfter * 1000 };
  return null;
}

// "m:ss"
export function formatCountdown(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
