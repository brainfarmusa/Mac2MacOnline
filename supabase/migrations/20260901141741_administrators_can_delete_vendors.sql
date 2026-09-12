create policy "administrators_can_delete_vendors"
on public.pdd_vendors
for delete
to authenticated
using (
  exists (
    select 1
    from public.pdd_employee_access access
    where access.email = lower(auth.jwt() ->> 'email')
      and access.active = true
      and access.role = 'administrator'
  )
);
