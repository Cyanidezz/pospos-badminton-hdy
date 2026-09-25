-- "ราคาขึ้นเอ็น" on the LINE OA rich menu: the owner's own price text and price-list picture (ตั้งค่าร้าน), sent back
-- when a customer taps the button. The picture is served publicly (LINE's servers fetch it) only while it is this
-- setting's current image - see app/api/line/promo-image/[id]/route.ts.
alter table public.config add column if not exists string_price_text text not null default '';
alter table public.config add column if not exists string_price_image text references public.files(id) on delete set null;
