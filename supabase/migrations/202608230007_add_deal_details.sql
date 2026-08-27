alter table public.pdd_deal_uploads
  add column if not exists deal_number text,
  add column if not exists short_description text,
  add column if not exists bid_close_date date,
  add column if not exists bid_close_time time without time zone,
  add column if not exists bid_timezone text not null default 'America/Los_Angeles',
  add column if not exists display_name text,
  add column if not exists display_filename text,
  add column if not exists details_completed_at timestamp with time zone;

alter table public.pdd_deal_uploads
  add constraint pdd_deal_uploads_deal_number_format
  check (deal_number is null or deal_number ~ '^B[0-9]{6}-[0-9]{2}$'),
  add constraint pdd_deal_uploads_short_description_not_blank
  check (short_description is null or length(btrim(short_description)) > 0),
  add constraint pdd_deal_uploads_bid_timezone_supported
  check (bid_timezone = 'America/Los_Angeles');

create unique index if not exists pdd_deal_uploads_deal_number_key
  on public.pdd_deal_uploads (deal_number)
  where deal_number is not null;

grant select, insert, update on table public.pdd_deal_uploads to authenticated;
