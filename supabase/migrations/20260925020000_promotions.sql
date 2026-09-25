-- Promotions shown to customers on LINE (rich menu "โปรโมชั่น" -> a Flex carousel, one card per active promotion).
-- Managed from "ตั้งค่าร้าน" by the owner. image is an uploaded file (see /api/upload); it's served publicly only
-- while an active promotion uses it (/api/line/promo-image/[id]), since LINE's servers fetch it without a login.
create table if not exists public.promotions (
  id text primary key,
  title text not null,
  body text not null default '',
  image text references public.files(id) on delete set null,
  active smallint not null default 1 check (active in (0,1)),
  created text not null,
  updated text not null
);
alter table public.promotions enable row level security;
revoke all on public.promotions from anon, authenticated;
