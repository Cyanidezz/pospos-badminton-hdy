-- สมาชิกผ่าน LINE: which LINE account belongs to which phone number (the member key everywhere else - jobs,
-- POS bills, manual members, stamps). One LINE account may hold several phones (a parent with a child's number)
-- and one phone may be linked from several LINE accounts.
-- status: 'verified' = the link is trusted (a brand-new number, a job number from that phone's receipt, the old
--         receipt-QR "LINK", or a staff approval); 'pending' = a number with shop history that a staff member still
--         has to approve (so nobody can read someone else's stamps just by typing their number).
-- method: how it was verified ('new' / 'job' / 'link' / 'staff'), for the staff list.
create table if not exists public.line_members (
  line_user text not null,
  phone text not null check (phone ~ '^\d{9,10}$'),
  name text not null default '',
  status text not null default 'pending' check (status in ('pending','verified')),
  method text not null default '' check (method in ('','new','job','link','staff')),
  created text not null,
  verified_at text,
  verified_by uuid references public.members(id) on delete set null,
  primary key (line_user, phone)
);
create index if not exists line_members_phone on public.line_members (phone);
create index if not exists line_members_pending on public.line_members (created desc) where status = 'pending';

alter table public.line_members enable row level security;
revoke all on public.line_members from anon, authenticated;
