alter table public.pdd_purchase_orders
  add column if not exists xlsx_storage_path text,
  add column if not exists pdf_storage_path text;

alter table public.pdd_sales_orders
  add column if not exists xlsx_storage_path text,
  add column if not exists pdf_storage_path text;

comment on column public.pdd_purchase_orders.xlsx_storage_path is 'Private Supabase Storage object path for the generated Excel workbook.';
comment on column public.pdd_purchase_orders.pdf_storage_path is 'Private Supabase Storage object path for the generated PDF.';
comment on column public.pdd_sales_orders.xlsx_storage_path is 'Private Supabase Storage object path for the generated Excel workbook.';
comment on column public.pdd_sales_orders.pdf_storage_path is 'Private Supabase Storage object path for the generated PDF.';
