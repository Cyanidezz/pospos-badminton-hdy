import { SOCK_REWARD_REASON } from "./customers";

// Server-side "stars since the last redemption" for a customer (matched by phone digits), as ONE SQL expression so
// it can guard an INSERT/UPDATE directly (a customer's own redeem on the tracking page) as well as be read on its
// own (staff ticking "ใช้สิทธิ์" when taking in a racket). Mirrors buildCustomers() in lib/customers.ts: a stamp
// per paid, non-reward job plus one per member POS bill at or above the minimum, counted only since the most
// recent redemption of EITHER reward tier - redeeming one resets the count for both.
export function starsSql(config: any, digits: string) {
  const posMin = Number(config.member_pos_min_amount) || 0;
  // Same rule as withinPromo() in lib/customers.ts: a visit only counts toward the reward while the promotion is on
  // (and, if set, inside its date window) - a reward already earned still redeems fine either way.
  const promoOn = !('member_promo_enabled' in config) || config.member_promo_enabled !== 0;
  const dateFilter = promoOn ? "AND created>=COALESCE(?,'0000-01-01') AND created<=COALESCE(?,'9999-12-31')" : 'AND 1=0';
  const dateArgs = promoOn ? [config.member_promo_start || null, config.member_promo_end || null] : [];
  const sinceSql = `GREATEST(COALESCE((SELECT MAX(created) FROM jobs WHERE regexp_replace(phone,'\\D','','g')=? AND reward_used=1),'1900-01-01'),COALESCE((SELECT MAX(created) FROM sales WHERE customer_key=? AND discount_reason=?),'1900-01-01'))`;
  const sql = `(SELECT COUNT(*) FROM (SELECT created FROM jobs WHERE regexp_replace(phone,'\\D','','g')=? AND status<>'ยกเลิก' AND paid=1 AND reward_used=0 ${dateFilter} UNION ALL SELECT created FROM sales WHERE customer_key=? AND status='active' AND job_id IS NULL AND total>=? AND COALESCE(discount_reason,'')<>? ${dateFilter}) e WHERE e.created>${sinceSql})`;
  return { sql, args: [digits, ...dateArgs, digits, posMin, SOCK_REWARD_REASON, ...dateArgs, digits, digits, SOCK_REWARD_REASON] };
}
