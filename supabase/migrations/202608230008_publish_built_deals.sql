alter table public.pdd_deal_uploads
  add column if not exists published_at timestamp with time zone;

create table if not exists public.pdd_public_deals (
  id uuid primary key default gen_random_uuid(),
  source_upload_id uuid not null unique references public.pdd_deal_uploads(id) on delete cascade,
  deal_number text not null unique,
  direction text not null default 'selling' check (direction in ('buying','selling')),
  category text not null,
  title text not null,
  description text not null,
  quantity integer not null check (quantity > 0),
  manufacturer text not null default 'Mixed',
  part_number text not null default 'Multiple line items',
  closes_at timestamp with time zone not null,
  location text not null default 'California, USA',
  public_lines jsonb not null default '[]'::jsonb,
  spreadsheet_filename text not null,
  status text not null default 'open' check (status in ('draft','open','closed','archived')),
  published boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.pdd_public_deals enable row level security;

create policy "public_reads_open_pdd_deals"
on public.pdd_public_deals for select to anon
using (published = true and status = 'open');

create policy "employees_read_publishable_deals"
on public.pdd_public_deals for select to authenticated
using (
  published = true
  or exists (
    select 1 from public.pdd_deal_uploads source
    where source.id = source_upload_id
      and (
        source.uploaded_by = (select auth.uid())
        or exists (
          select 1 from public.pdd_employee_access access
          where access.email = lower((select auth.jwt()) ->> 'email')
            and access.active = true and access.role = 'administrator'
        )
      )
  )
);

create policy "owners_or_admins_publish_deals"
on public.pdd_public_deals for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.pdd_deal_uploads source
    where source.id = source_upload_id
      and (
        source.uploaded_by = (select auth.uid())
        or exists (
          select 1 from public.pdd_employee_access access
          where access.email = lower((select auth.jwt()) ->> 'email')
            and access.active = true and access.role = 'administrator'
        )
      )
  )
);

create policy "owners_or_admins_update_public_deals"
on public.pdd_public_deals for update to authenticated
using (
  exists (
    select 1 from public.pdd_deal_uploads source
    where source.id = source_upload_id
      and (
        source.uploaded_by = (select auth.uid())
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
        or exists (
          select 1 from public.pdd_employee_access access
          where access.email = lower((select auth.jwt()) ->> 'email')
            and access.active = true and access.role = 'administrator'
        )
      )
  )
);

grant select on table public.pdd_public_deals to anon;
grant select, insert, update on table public.pdd_public_deals to authenticated;

create index if not exists pdd_public_deals_open_close_idx
  on public.pdd_public_deals (published, status, closes_at);
