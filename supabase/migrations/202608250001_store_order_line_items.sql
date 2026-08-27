alter table public.pdd_purchase_orders
  add column if not exists purchasing_owner_id uuid references auth.users(id) on delete set null,
  add column if not exists purchasing_owner_name text not null default '',
  add column if not exists purchasing_owner_email text not null default '';

alter table public.pdd_sales_orders
  add column if not exists sales_owner_name text not null default '',
  add column if not exists sales_owner_email text not null default '';

create table if not exists public.pdd_purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.pdd_purchase_orders(id) on delete cascade,
  line_number integer not null,
  product_sku text not null default '',
  product_description text not null,
  quantity integer not null,
  unit_cost numeric(14,4) not null,
  line_total numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint pdd_purchase_order_lines_order_line_unique unique (purchase_order_id,line_number),
  constraint pdd_purchase_order_lines_quantity_positive check (quantity > 0),
  constraint pdd_purchase_order_lines_amounts_nonnegative check (unit_cost >= 0 and line_total >= 0)
);

create table if not exists public.pdd_sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.pdd_sales_orders(id) on delete cascade,
  line_number integer not null,
  product_sku text not null default '',
  product_description text not null,
  quantity integer not null,
  unit_price numeric(14,4) not null,
  line_total numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint pdd_sales_order_lines_order_line_unique unique (sales_order_id,line_number),
  constraint pdd_sales_order_lines_quantity_positive check (quantity > 0),
  constraint pdd_sales_order_lines_amounts_nonnegative check (unit_price >= 0 and line_total >= 0)
);

alter table public.pdd_purchase_order_lines enable row level security;
alter table public.pdd_sales_order_lines enable row level security;

create policy "employees_read_purchase_order_lines" on public.pdd_purchase_order_lines
for select to authenticated using (exists (
  select 1 from public.pdd_employee_access access
  where access.email=lower((select auth.jwt())->>'email') and access.active=true
));

create policy "employees_write_purchase_order_lines" on public.pdd_purchase_order_lines
for insert to authenticated with check (exists (
  select 1 from public.pdd_purchase_orders orders
  where orders.id=purchase_order_id and orders.generated_by=(select auth.uid())
));

create policy "employees_update_purchase_order_lines" on public.pdd_purchase_order_lines
for update to authenticated using (exists (
  select 1 from public.pdd_employee_access access
  where access.email=lower((select auth.jwt())->>'email') and access.active=true
)) with check (exists (
  select 1 from public.pdd_employee_access access
  where access.email=lower((select auth.jwt())->>'email') and access.active=true
));

create policy "employees_read_sales_order_lines" on public.pdd_sales_order_lines
for select to authenticated using (exists (
  select 1 from public.pdd_employee_access access
  where access.email=lower((select auth.jwt())->>'email') and access.active=true
));

create policy "employees_write_sales_order_lines" on public.pdd_sales_order_lines
for insert to authenticated with check (exists (
  select 1 from public.pdd_sales_orders orders
  where orders.id=sales_order_id and orders.generated_by=(select auth.uid())
));

create policy "employees_update_sales_order_lines" on public.pdd_sales_order_lines
for update to authenticated using (exists (
  select 1 from public.pdd_employee_access access
  where access.email=lower((select auth.jwt())->>'email') and access.active=true
)) with check (exists (
  select 1 from public.pdd_employee_access access
  where access.email=lower((select auth.jwt())->>'email') and access.active=true
));

grant select,insert,update on public.pdd_purchase_order_lines to authenticated;
grant select,insert,update on public.pdd_sales_order_lines to authenticated;
revoke all on public.pdd_purchase_order_lines from anon;
revoke all on public.pdd_sales_order_lines from anon;

create index if not exists pdd_purchase_orders_purchasing_owner_email_idx on public.pdd_purchase_orders(lower(purchasing_owner_email));
create index if not exists pdd_sales_orders_sales_owner_email_idx on public.pdd_sales_orders(lower(sales_owner_email));
create index if not exists pdd_purchase_order_lines_order_idx on public.pdd_purchase_order_lines(purchase_order_id);
create index if not exists pdd_purchase_order_lines_sku_idx on public.pdd_purchase_order_lines(lower(product_sku));
create index if not exists pdd_purchase_order_lines_description_idx on public.pdd_purchase_order_lines(lower(product_description));
create index if not exists pdd_sales_order_lines_order_idx on public.pdd_sales_order_lines(sales_order_id);
create index if not exists pdd_sales_order_lines_sku_idx on public.pdd_sales_order_lines(lower(product_sku));
create index if not exists pdd_sales_order_lines_description_idx on public.pdd_sales_order_lines(lower(product_description));
