create table if not exists public.pdd_vendors (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  email text not null default '',
  phone text not null default '',
  address1 text not null,
  address2 text not null default '',
  city text not null,
  region text not null,
  postal_code text not null,
  country text not null default 'United States',
  created_by uuid not null references auth.users(id),
  created_by_name text not null,
  created_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pdd_vendors_company_not_blank check (length(trim(company_name)) > 0),
  constraint pdd_vendors_contact_not_blank check (length(trim(contact_name)) > 0),
  constraint pdd_vendors_address_not_blank check (length(trim(address1)) > 0),
  constraint pdd_vendors_city_not_blank check (length(trim(city)) > 0),
  constraint pdd_vendors_region_not_blank check (length(trim(region)) > 0),
  constraint pdd_vendors_postal_not_blank check (length(trim(postal_code)) > 0)
);

alter table public.pdd_vendors enable row level security;

create policy "employees_read_vendors"
on public.pdd_vendors for select to authenticated
using (exists (
  select 1 from public.pdd_employee_access access
  where access.email = lower((select auth.jwt()->>'email')) and access.active = true
));

create policy "employees_create_vendors"
on public.pdd_vendors for insert to authenticated
with check (
  (select auth.uid()) = created_by and exists (
    select 1 from public.pdd_employee_access access
    where access.email = lower((select auth.jwt()->>'email')) and access.active = true
  )
);

create policy "employees_update_vendors"
on public.pdd_vendors for update to authenticated
using (exists (
  select 1 from public.pdd_employee_access access
  where access.email = lower((select auth.jwt()->>'email')) and access.active = true
))
with check (exists (
  select 1 from public.pdd_employee_access access
  where access.email = lower((select auth.jwt()->>'email')) and access.active = true
));

grant select, insert, update on public.pdd_vendors to authenticated;
revoke all on public.pdd_vendors from anon;

create index if not exists pdd_vendors_company_name_idx
  on public.pdd_vendors (lower(company_name));

alter table public.pdd_deal_uploads
  add column if not exists vendor_id uuid references public.pdd_vendors(id) on delete restrict;

create index if not exists pdd_deal_uploads_vendor_id_idx
  on public.pdd_deal_uploads (vendor_id);
