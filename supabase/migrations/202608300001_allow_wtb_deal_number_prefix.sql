alter table public.pdd_deal_uploads
  drop constraint if exists pdd_deal_uploads_deal_number_format;

alter table public.pdd_deal_uploads
  add constraint pdd_deal_uploads_deal_number_format
  check (deal_number is null or deal_number ~ '^(B|WTB)[0-9]{6}-[0-9]{2}$');
