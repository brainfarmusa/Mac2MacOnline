alter table public.pdd_purchase_orders
  drop constraint if exists pdd_purchase_orders_order_status_check,
  add constraint pdd_purchase_orders_order_status_check
    check (order_status in ('open', 'awarded_pending_fulfillment', 'completed'));

alter table public.pdd_sales_orders
  drop constraint if exists pdd_sales_orders_order_status_check,
  add constraint pdd_sales_orders_order_status_check
    check (order_status in ('open', 'awarded_pending_fulfillment', 'completed'));
