alter table public.pdd_deal_uploads
  add column if not exists mapping_reviewed_at timestamptz,
  add column if not exists mapping_reviewed_by uuid references auth.users(id) on delete set null;

