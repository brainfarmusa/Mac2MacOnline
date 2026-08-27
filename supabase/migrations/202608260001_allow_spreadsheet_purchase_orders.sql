alter table public.pdd_purchase_orders
  alter column source_upload_id drop not null,
  add column if not exists source_type text not null default 'deal',
  add column if not exists source_file_name text not null default '';

alter table public.pdd_purchase_orders
  drop constraint if exists pdd_purchase_orders_source_type_check;

alter table public.pdd_purchase_orders
  add constraint pdd_purchase_orders_source_type_check
  check (source_type in ('deal', 'spreadsheet'));

comment on column public.pdd_purchase_orders.source_type is 'Whether the PO was created from a stored deal or a directly uploaded spreadsheet.';
comment on column public.pdd_purchase_orders.source_file_name is 'Original filename when the PO source was a direct spreadsheet upload.';
