create table if not exists public.pdd_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  deal_number text not null unique,
  internal_bid_number text not null,
  source_upload_id uuid not null references public.pdd_deal_uploads(id) on delete restrict,
  vendor_id uuid not null references public.pdd_vendors(id) on delete restrict,
  margin_percent numeric(6,3) not null,
  customer_total numeric(14,2) not null,
  vendor_total numeric(14,2) not null,
  generated_by uuid not null references auth.users(id),
  generated_by_name text not null,
  generated_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pdd_purchase_orders_margin_range check (margin_percent >= 0 and margin_percent < 100),
  constraint pdd_purchase_orders_totals_nonnegative check (customer_total >= 0 and vendor_total >= 0)
);

alter table public.pdd_purchase_orders enable row level security;

create policy "employees_read_purchase_orders" on public.pdd_purchase_orders
for select to authenticated using (exists (
  select 1 from public.pdd_employee_access access
  where access.email=lower((select auth.jwt())->>'email') and access.active=true
));

create policy "employees_create_purchase_orders" on public.pdd_purchase_orders
for insert to authenticated with check (
  (select auth.uid())=generated_by and exists (
    select 1 from public.pdd_employee_access access
    where access.email=lower((select auth.jwt())->>'email') and access.active=true
  )
);

create policy "employees_update_purchase_orders" on public.pdd_purchase_orders
for update to authenticated using (exists (
  select 1 from public.pdd_employee_access access
  where access.email=lower((select auth.jwt())->>'email') and access.active=true
)) with check (exists (
  select 1 from public.pdd_employee_access access
  where access.email=lower((select auth.jwt())->>'email') and access.active=true
));

grant select,insert,update on public.pdd_purchase_orders to authenticated;
revoke all on public.pdd_purchase_orders from anon;

create index if not exists pdd_purchase_orders_vendor_id_idx on public.pdd_purchase_orders(vendor_id);
create index if not exists pdd_purchase_orders_source_upload_id_idx on public.pdd_purchase_orders(source_upload_id);
create index if not exists pdd_purchase_orders_generated_by_idx on public.pdd_purchase_orders(generated_by);
