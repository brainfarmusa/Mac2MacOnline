alter table public.pdd_deal_uploads
  add column if not exists header_row integer,
  add column if not exists column_mapping jsonb not null default '{"version":1,"columns":[]}'::jsonb;

alter table public.pdd_deal_uploads
  add constraint pdd_deal_uploads_header_row_positive
  check (header_row is null or header_row > 0);

