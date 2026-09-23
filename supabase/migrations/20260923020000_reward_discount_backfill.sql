-- Member-reward jobs paid before the reward was booked on the bill: record the waived amount as the bill's
-- discount (and as the string item's line discount), the same way payJob does now, so the POS sales list and the
-- dashboard show what past free stringings cost the shop. Totals and net amounts are unchanged. Safe to re-run:
-- only bills that still have no discount are touched.
update public.items i
set price = i.price + j.reward_discount,
    line_discount = j.reward_discount,
    note = coalesce(i.note, '') || ' · ใช้สิทธิ์สมาชิก'
from public.sales s
join public.jobs j on j.id = s.job_id
where i.sale_id = s.id
  and j.reward_used = 1 and j.reward_discount > 0
  and s.discount = 0 and i.line_discount = 0;

update public.sales s
set discount = j.reward_discount,
    discount_reason = 'สิทธิ์สมาชิก: ขึ้นเอ็นฟรี'
from public.jobs j
where j.id = s.job_id
  and j.reward_used = 1 and j.reward_discount > 0
  and s.discount = 0;
