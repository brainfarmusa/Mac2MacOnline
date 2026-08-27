create table if not exists public.pdd_sales_orders (
  id uuid primary key default gen_random_uuid(),
  so_number text not null unique,
  deal_number text not null unique,
  internal_bid_number text not null,
  customer_company text not null,
  customer_contact text not null,
  customer_email text not null,
  customer_phone text not null,
  customer_address1 text not null default '',
  customer_address2 text not null default '',
  customer_city text not null default '',
  customer_region text not null default '',
  customer_postal_code text not null default '',
  customer_country text not null default '',
  sales_total numeric(14,2) not null,
  generated_by uuid not null references auth.users(id),
  generated_by_name text not null,
  generated_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pdd_sales_orders_total_nonnegative check (sales_total >= 0)
);

alter table public.pdd_sales_orders enable row level security;

create policy "employees_read_sales_orders" on public.pdd_sales_orders
for select to authenticated using (exists (
  select 1 from public.pdd_employee_access access
  where access.email=lower((select auth.jwt())->>'email') and access.active=true
));

create policy "employees_create_sales_orders" on public.pdd_sales_orders
for insert to authenticated with check (
  (select auth.uid())=generated_by and exists (
    select 1 from public.pdd_employee_access access
    where access.email=lower((select auth.jwt())->>'email') and access.active=true
  )
);

create policy "employees_update_sales_orders" on public.pdd_sales_orders
for update to authenticated using (exists (
  select 1 from public.pdd_employee_access access
  where access.email=lower((select auth.jwt())->>'email') and access.active=true
)) with check (exists (
  select 1 from public.pdd_employee_access access
  where access.email=lower((select auth.jwt())->>'email') and access.active=true
));

grant select,insert,update on public.pdd_sales_orders to authenticated;
revoke all on public.pdd_sales_orders from anon;

create index if not exists pdd_sales_orders_internal_bid_number_idx on public.pdd_sales_orders(internal_bid_number);
create index if not exists pdd_sales_orders_generated_by_idx on public.pdd_sales_orders(generated_by);
