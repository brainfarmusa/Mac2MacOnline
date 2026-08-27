alter table public.pdd_deal_uploads
  add column if not exists quantified_lines jsonb not null default '[]'::jsonb,
  add column if not exists quantified_line_count integer not null default 0;

alter table public.pdd_deal_uploads
  add constraint pdd_deal_uploads_quantified_line_count_nonnegative
  check (quantified_line_count >= 0);

