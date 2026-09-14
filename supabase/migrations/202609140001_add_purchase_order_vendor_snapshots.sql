alter table public.pdd_purchase_orders
  add column if not exists vendor_company text not null default '',
  add column if not exists vendor_contact text not null default '',
  add column if not exists vendor_email text not null default '',
  add column if not exists vendor_phone text not null default '',
  add column if not exists vendor_address1 text not null default '',
  add column if not exists vendor_address2 text not null default '',
  add column if not exists vendor_city text not null default '',
  add column if not exists vendor_region text not null default '',
  add column if not exists vendor_postal_code text not null default '',
  add column if not exists vendor_country text not null default '';

update public.pdd_purchase_orders as purchase_order
set
  vendor_company = vendor.company_name,
  vendor_contact = vendor.contact_name,
  vendor_email = vendor.email,
  vendor_phone = vendor.phone,
  vendor_address1 = vendor.address1,
  vendor_address2 = vendor.address2,
  vendor_city = vendor.city,
  vendor_region = vendor.region,
  vendor_postal_code = vendor.postal_code,
  vendor_country = vendor.country
from public.pdd_vendors as vendor
where purchase_order.vendor_id = vendor.id
  and purchase_order.vendor_company = '';
