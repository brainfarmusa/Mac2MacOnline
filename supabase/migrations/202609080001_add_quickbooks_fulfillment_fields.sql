alter table public.pdd_purchase_orders
  add column if not exists qb_invoice_number text not null default '',
  add column if not exists qb_po_number text not null default '',
  add column if not exists fulfillment_comments text not null default '';

alter table public.pdd_sales_orders
  add column if not exists qb_invoice_number text not null default '',
  add column if not exists qb_po_number text not null default '',
  add column if not exists fulfillment_comments text not null default '';

comment on column public.pdd_purchase_orders.qb_invoice_number is 'QuickBooks invoice number mirrored across both sides of the deal.';
comment on column public.pdd_purchase_orders.qb_po_number is 'QuickBooks purchase order number mirrored across both sides of the deal.';
comment on column public.pdd_purchase_orders.fulfillment_comments is 'Fulfillment comments mirrored across both sides of the deal.';
comment on column public.pdd_sales_orders.qb_invoice_number is 'QuickBooks invoice number mirrored across both sides of the deal.';
comment on column public.pdd_sales_orders.qb_po_number is 'QuickBooks purchase order number mirrored across both sides of the deal.';
comment on column public.pdd_sales_orders.fulfillment_comments is 'Fulfillment comments mirrored across both sides of the deal.';
