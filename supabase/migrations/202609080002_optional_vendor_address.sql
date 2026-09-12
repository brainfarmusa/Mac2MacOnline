alter table public.pdd_vendors
  drop constraint if exists pdd_vendors_address_not_blank,
  drop constraint if exists pdd_vendors_city_not_blank,
  drop constraint if exists pdd_vendors_region_not_blank,
  drop constraint if exists pdd_vendors_postal_not_blank;
