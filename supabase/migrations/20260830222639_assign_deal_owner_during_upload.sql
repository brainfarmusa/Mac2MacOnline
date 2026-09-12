create schema if not exists private;

create or replace function private.is_active_pdd_employee()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.pdd_employee_access access
      where access.email = lower((select auth.jwt()) ->> 'email')
        and access.active = true
    );
$$;

revoke all on function private.is_active_pdd_employee() from public;
grant execute on function private.is_active_pdd_employee() to authenticated;

drop policy if exists "employees_read_own_access" on public.pdd_employee_access;
drop policy if exists "employees_read_active_employee_directory" on public.pdd_employee_access;
create policy "employees_read_active_employee_directory"
on public.pdd_employee_access for select to authenticated
using (active = true and (select private.is_active_pdd_employee()));

drop policy if exists "employees_insert_own_deal_uploads" on public.pdd_deal_uploads;
create policy "employees_insert_assigned_deal_uploads"
on public.pdd_deal_uploads for insert to authenticated
with check (
  (select auth.uid()) = uploaded_by
  and (select private.is_active_pdd_employee())
  and exists (
    select 1 from public.pdd_employee_access owner
    where owner.email = employee_email and owner.active = true
  )
);

drop policy if exists "owners_or_admins_update_deal_uploads" on public.pdd_deal_uploads;
create policy "uploader_owner_or_admin_updates_deal_uploads"
on public.pdd_deal_uploads for update to authenticated
using (
  uploaded_by = (select auth.uid())
  or employee_email = lower((select auth.jwt()) ->> 'email')
  or exists (
    select 1 from public.pdd_employee_access access
    where access.email = lower((select auth.jwt()) ->> 'email')
      and access.active = true and access.role = 'administrator'
  )
)
with check (
  (
    uploaded_by = (select auth.uid())
    or employee_email = lower((select auth.jwt()) ->> 'email')
    or exists (
      select 1 from public.pdd_employee_access access
      where access.email = lower((select auth.jwt()) ->> 'email')
        and access.active = true and access.role = 'administrator'
    )
  )
  and exists (
    select 1 from public.pdd_employee_access owner
    where owner.email = employee_email and owner.active = true
  )
);

drop policy if exists "owners_or_admins_delete_deal_uploads" on public.pdd_deal_uploads;
create policy "uploader_owner_or_admin_deletes_deal_uploads"
on public.pdd_deal_uploads for delete to authenticated
using (
  uploaded_by = (select auth.uid())
  or employee_email = lower((select auth.jwt()) ->> 'email')
  or exists (
    select 1 from public.pdd_employee_access access
    where access.email = lower((select auth.jwt()) ->> 'email')
      and access.active = true and access.role = 'administrator'
  )
);

drop policy if exists "employees_read_publishable_deals" on public.pdd_public_deals;
create policy "employees_read_publishable_deals"
on public.pdd_public_deals for select to authenticated
using (
  published = true
  or exists (
    select 1 from public.pdd_deal_uploads source
    where source.id = source_upload_id
      and (
        source.uploaded_by = (select auth.uid())
        or source.employee_email = lower((select auth.jwt()) ->> 'email')
        or exists (
          select 1 from public.pdd_employee_access access
          where access.email = lower((select auth.jwt()) ->> 'email')
            and access.active = true and access.role = 'administrator'
        )
      )
  )
);

drop policy if exists "owners_or_admins_publish_deals" on public.pdd_public_deals;
create policy "uploader_owner_or_admin_publishes_deals"
on public.pdd_public_deals for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.pdd_deal_uploads source
    where source.id = source_upload_id
      and (
        source.uploaded_by = (select auth.uid())
        or source.employee_email = lower((select auth.jwt()) ->> 'email')
        or exists (
          select 1 from public.pdd_employee_access access
          where access.email = lower((select auth.jwt()) ->> 'email')
            and access.active = true and access.role = 'administrator'
        )
      )
  )
);

drop policy if exists "owners_or_admins_update_public_deals" on public.pdd_public_deals;
create policy "uploader_owner_or_admin_updates_public_deals"
on public.pdd_public_deals for update to authenticated
using (
  exists (
    select 1 from public.pdd_deal_uploads source
    where source.id = source_upload_id
      and (
        source.uploaded_by = (select auth.uid())
        or source.employee_email = lower((select auth.jwt()) ->> 'email')
        or exists (
          select 1 from public.pdd_employee_access access
          where access.email = lower((select auth.jwt()) ->> 'email')
            and access.active = true and access.role = 'administrator'
        )
      )
  )
)
with check (
  exists (
    select 1 from public.pdd_deal_uploads source
    where source.id = source_upload_id
      and (
        source.uploaded_by = (select auth.uid())
        or source.employee_email = lower((select auth.jwt()) ->> 'email')
        or exists (
          select 1 from public.pdd_employee_access access
          where access.email = lower((select auth.jwt()) ->> 'email')
            and access.active = true and access.role = 'administrator'
        )
      )
  )
);

drop policy if exists "owners_or_admins_delete_raw_deals" on storage.objects;
create policy "uploader_owner_or_admin_deletes_raw_deals"
on storage.objects for delete to authenticated
using (
  bucket_id = 'pdd-deal-uploads'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.pdd_deal_uploads source
      where source.storage_path = name
        and source.employee_email = lower((select auth.jwt()) ->> 'email')
    )
    or exists (
      select 1 from public.pdd_employee_access access
      where access.email = lower((select auth.jwt()) ->> 'email')
        and access.active = true and access.role = 'administrator'
    )
  )
);
