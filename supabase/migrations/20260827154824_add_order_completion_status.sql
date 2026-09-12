alter table public.pdd_purchase_orders
  add column if not exists order_status text not null default 'open',
  add column if not exists completed_at timestamptz;

alter table public.pdd_sales_orders
  add column if not exists order_status text not null default 'open',
  add column if not exists completed_at timestamptz;

alter table public.pdd_purchase_orders
  drop constraint if exists pdd_purchase_orders_order_status_check,
  add constraint pdd_purchase_orders_order_status_check
    check (order_status in ('open', 'completed'));

alter table public.pdd_sales_orders
  drop constraint if exists pdd_sales_orders_order_status_check,
  add constraint pdd_sales_orders_order_status_check
    check (order_status in ('open', 'completed'));

create index if not exists pdd_purchase_orders_order_status_idx
  on public.pdd_purchase_orders(order_status, created_at desc);

create index if not exists pdd_sales_orders_order_status_idx
  on public.pdd_sales_orders(order_status, created_at desc);
