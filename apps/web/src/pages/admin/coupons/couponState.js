// Where a coupon stands, worked out from its own data the way the API
// decides at checkout (couponController.evaluateCoupon): switched off,
// not started yet, expired, used up, or running (nearly used up when 80%
// of its uses are gone).
export function couponState(coupon, now = Date.now()) {
  if (!coupon.is_active) return "off";
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) return "scheduled";
  if (new Date(coupon.expires_at).getTime() < now) return "expired";
  if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) return "usedUp";
  if (coupon.usage_limit && coupon.used_count / coupon.usage_limit >= 0.8) return "almostUsed";
  return "running";
}

export const STATE_TONE = { running: "success", almostUsed: "warning", scheduled: "info", expired: "neutral", usedUp: "danger", off: "neutral" };

// The filter chips: "running" includes "nearly used up".
export const FILTERS = ["all", "running", "scheduled", "expired", "usedUp", "off"];
export const matchesFilter = (state, filter) => filter === "all" || state === filter || (filter === "running" && state === "almostUsed");
