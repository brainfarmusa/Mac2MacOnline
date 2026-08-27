drop policy if exists "employees_read_vendors" on public.pdd_vendors;
drop policy if exists "employees_create_vendors" on public.pdd_vendors;
drop policy if exists "employees_update_vendors" on public.pdd_vendors;

create policy "employees_read_vendors"
on public.pdd_vendors for select to authenticated
using (exists (
  select 1 from public.pdd_employee_access access
  where access.email = lower((select auth.jwt())->>'email') and access.active = true
));

create policy "employees_create_vendors"
on public.pdd_vendors for insert to authenticated
with check (
  (select auth.uid()) = created_by and exists (
    select 1 from public.pdd_employee_access access
    where access.email = lower((select auth.jwt())->>'email') and access.active = true
  )
);

create policy "employees_update_vendors"
on public.pdd_vendors for update to authenticated
using (exists (
  select 1 from public.pdd_employee_access access
  where access.email = lower((select auth.jwt())->>'email') and access.active = true
))
with check (exists (
  select 1 from public.pdd_employee_access access
  where access.email = lower((select auth.jwt())->>'email') and access.active = true
));

create index if not exists pdd_vendors_created_by_idx on public.pdd_vendors (created_by);
