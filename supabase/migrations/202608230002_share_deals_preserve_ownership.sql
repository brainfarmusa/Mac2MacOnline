drop policy if exists "employees_read_deal_uploads" on public.pdd_deal_uploads;

create policy "employees_read_all_deal_uploads"
on public.pdd_deal_uploads
for select
to authenticated
using (
  exists (
    select 1 from public.pdd_employee_access access
    where access.email = lower((select auth.jwt()) ->> 'email')
      and access.active = true
  )
);

create policy "employees_update_own_deal_uploads"
on public.pdd_deal_uploads
for update
to authenticated
using ((select auth.uid()) = uploaded_by)
with check (
  (select auth.uid()) = uploaded_by
  and lower((select auth.jwt()) ->> 'email') = employee_email
);

grant update on public.pdd_deal_uploads to authenticated;

drop policy if exists "employees_read_raw_deals" on storage.objects;

create policy "employees_read_all_raw_deals"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'pdd-deal-uploads'
  and exists (
    select 1 from public.pdd_employee_access access
    where access.email = lower((select auth.jwt()) ->> 'email')
      and access.active = true
  )
);
