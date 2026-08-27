create table if not exists public.pdd_commissions (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.pdd_purchase_orders(id) on delete cascade,
  sales_order_id uuid not null references public.pdd_sales_orders(id) on delete cascade,
  purchase_order_number text not null,
  sales_order_number text not null,
  buyer_name text not null,
  buyer_email text not null default '',
  salesperson_name text not null,
  salesperson_email text not null default '',
  purchase_cost numeric(14,2) not null,
  sales_total numeric(14,2) not null,
  gross_profit numeric(14,2) not null,
  buyer_rate numeric(6,3) not null,
  salesperson_rate numeric(6,3) not null,
  buyer_commission numeric(14,2) not null,
  salesperson_commission numeric(14,2) not null,
  commission_rule text not null,
  created_by uuid not null references auth.users(id),
  created_by_name text not null,
  created_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pdd_commissions_order_pair_unique unique (purchase_order_id,sales_order_id),
  constraint pdd_commissions_amounts_nonnegative check (purchase_cost >= 0 and sales_total >= 0 and buyer_commission >= 0 and salesperson_commission >= 0),
  constraint pdd_commissions_rates_valid check (buyer_rate >= 0 and buyer_rate <= 100 and salesperson_rate >= 0 and salesperson_rate <= 100)
);

alter table public.pdd_commissions enable row level security;

create policy "employees_read_commissions" on public.pdd_commissions
for select to authenticated using (exists (
  select 1 from public.pdd_employee_access access
  where access.email=lower((select auth.jwt())->>'email') and access.active=true
));

create policy "employees_create_commissions" on public.pdd_commissions
for insert to authenticated with check (
  (select auth.uid())=created_by and exists (
    select 1 from public.pdd_employee_access access
    where access.email=lower((select auth.jwt())->>'email') and access.active=true
  )
);

create policy "employees_update_commissions" on public.pdd_commissions
for update to authenticated using (exists (
  select 1 from public.pdd_employee_access access
  where access.email=lower((select auth.jwt())->>'email') and access.active=true
)) with check (exists (
  select 1 from public.pdd_employee_access access
  where access.email=lower((select auth.jwt())->>'email') and access.active=true
));

create policy "employees_delete_commissions" on public.pdd_commissions
for delete to authenticated using (exists (
  select 1 from public.pdd_employee_access access
  where access.email=lower((select auth.jwt())->>'email') and access.active=true
));

grant select,insert,update,delete on public.pdd_commissions to authenticated;
revoke all on public.pdd_commissions from anon;

create index if not exists pdd_commissions_purchase_order_idx on public.pdd_commissions(purchase_order_id);
create index if not exists pdd_commissions_sales_order_idx on public.pdd_commissions(sales_order_id);
create index if not exists pdd_commissions_buyer_email_idx on public.pdd_commissions(lower(buyer_email));
create index if not exists pdd_commissions_salesperson_email_idx on public.pdd_commissions(lower(salesperson_email));
create index if not exists pdd_commissions_created_at_idx on public.pdd_commissions(created_at desc);
create index if not exists pdd_commissions_created_by_idx on public.pdd_commissions(created_by);
