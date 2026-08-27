create policy "employees_delete_purchase_orders"
on public.pdd_purchase_orders
for delete
to authenticated
using (exists (
  select 1 from public.pdd_employee_access access
  where access.email = lower((select auth.jwt()) ->> 'email')
    and access.active = true
));

grant delete on public.pdd_purchase_orders to authenticated;

create policy "employees_delete_order_documents"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pdd-deal-uploads'
  and (storage.foldername(name))[2] = 'orders'
  and exists (
    select 1 from public.pdd_employee_access access
    where access.email = lower((select auth.jwt()) ->> 'email')
      and access.active = true
  )
);
