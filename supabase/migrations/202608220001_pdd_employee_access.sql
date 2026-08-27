create table public.pdd_employee_access (
  email text primary key,
  display_name text not null,
  role text not null check (role in ('administrator','employee')),
  active boolean not null default true,
  invited_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pdd_employee_access_email_lowercase check (email = lower(email))
);

alter table public.pdd_employee_access enable row level security;

create policy "employees_read_own_access"
on public.pdd_employee_access
for select
to authenticated
using (lower((select auth.jwt()) ->> 'email') = email);

insert into public.pdd_employee_access (email, display_name, role)
values ('darrell@mac2maconline.com', 'Darrell', 'administrator');

grant select on public.pdd_employee_access to authenticated;
revoke all on public.pdd_employee_access from anon;
