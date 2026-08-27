create table public.pdd_deal_uploads (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  employee_email text not null,
  original_name text not null,
  storage_path text not null unique,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  source_row_count integer not null default 0 check (source_row_count >= 0),
  source_headers jsonb not null default '[]'::jsonb,
  status text not null default 'uploaded' check (status in ('uploaded','mapping','quantified','draft','published','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pdd_deal_uploads enable row level security;

create policy "employees_insert_own_deal_uploads"
on public.pdd_deal_uploads
for insert
to authenticated
with check (
  (select auth.uid()) = uploaded_by
  and lower((select auth.jwt()) ->> 'email') = employee_email
  and exists (
    select 1 from public.pdd_employee_access access
    where access.email = lower((select auth.jwt()) ->> 'email')
      and access.active = true
  )
);

create policy "employees_read_deal_uploads"
on public.pdd_deal_uploads
for select
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

create policy "employees_delete_own_deal_uploads"
on public.pdd_deal_uploads
for delete
to authenticated
using ((select auth.uid()) = uploaded_by);

grant select, insert, delete on public.pdd_deal_uploads to authenticated;
revoke all on public.pdd_deal_uploads from anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pdd-deal-uploads',
  'pdd-deal-uploads',
  false,
  10485760,
  array[
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "employees_upload_own_raw_deals"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pdd-deal-uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.pdd_employee_access access
    where access.email = lower((select auth.jwt()) ->> 'email')
      and access.active = true
  )
);

create policy "employees_read_raw_deals"
on storage.objects
for select
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

create policy "employees_delete_own_raw_deals"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pdd-deal-uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
