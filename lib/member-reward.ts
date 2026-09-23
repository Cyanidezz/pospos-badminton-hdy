// Server-side check of how many free stringings a customer (matched by phone digits) can still redeem, as ONE SQL
// expression so it can guard an UPDATE directly (the customer's own redeem on the tracking page) as well as be read
// on its own (staff ticking "ใช้สิทธิ์" when taking in a racket). Mirrors buildCustomers() in lib/customers.ts:
// a stamp per paid, non-reward job plus one per member POS bill at or above the minimum, N stamps per reward,
// minus rewards already used.
export function availableRewardsSql(config: any, digits: string) {
  const need = Number(config.member_stamps_required) || 10, posMin = Number(config.member_pos_min_amount) || 0;
  // Same rule as withinPromo() in lib/customers.ts: a visit only counts toward the reward while the promotion is on
  // (and, if set, inside its date window) - a reward already earned still redeems fine either way.
  const promoOn = !('member_promo_enabled' in config) || config.member_promo_enabled !== 0;
  const dateFilter = promoOn ? "AND created>=COALESCE(?,'0000-01-01') AND created<=COALESCE(?,'9999-12-31')" : 'AND 1=0';
  const dateArgs = promoOn ? [config.member_promo_start || null, config.member_promo_end || null] : [];
  const sql = `(FLOOR(((SELECT COUNT(*) FROM jobs WHERE regexp_replace(phone,'\\D','','g')=? AND status<>'ยกเลิก' AND paid=1 AND reward_used=0 ${dateFilter})+(SELECT COUNT(*) FROM sales WHERE customer_key=? AND status='active' AND job_id IS NULL AND total>=? ${dateFilter}))::numeric/?::numeric)-(SELECT COUNT(*) FROM jobs WHERE regexp_replace(phone,'\\D','','g')=? AND status<>'ยกเลิก' AND reward_used=1))`;
  return { sql, args: [digits, ...dateArgs, digits, posMin, ...dateArgs, need, digits] };
}

