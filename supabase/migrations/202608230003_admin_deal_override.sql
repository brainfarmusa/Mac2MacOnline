drop policy if exists "employees_update_own_deal_uploads" on public.pdd_deal_uploads;
drop policy if exists "employees_delete_own_deal_uploads" on public.pdd_deal_uploads;

create policy "owners_or_admins_update_deal_uploads"
on public.pdd_deal_uploads
for update
to authenticated
using (
  (select auth.uid()) = uploaded_by
  or exists (
    select 1 from public.pdd_employee_access access
    where access.email = lower((select auth.jwt()) ->> 'email')
      and access.active = true
      and access.role = 'administrator'
  )
)
with check (
  (select auth.uid()) = uploaded_by
  or exists (
    select 1 from public.pdd_employee_access access
    where access.email = lower((select auth.jwt()) ->> 'email')
      and access.active = true
      and access.role = 'administrator'
  )
);

create policy "owners_or_admins_delete_deal_uploads"
on public.pdd_deal_uploads
for delete
to authenticated
using (
  (select auth.uid()) = uploaded_by
  or exists (
    select 1 from public.pdd_employee_access access
    where access.email = lower((select auth.jwt()) ->> 'email')
      and access.active = true
      and access.role = 'administrator'
  )
);

drop policy if exists "employees_delete_own_raw_deals" on storage.objects;

create policy "owners_or_admins_delete_raw_deals"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pdd-deal-uploads'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.pdd_employee_access access
      where access.email = lower((select auth.jwt()) ->> 'email')
        and access.active = true
        and access.role = 'administrator'
    )
  )
);
