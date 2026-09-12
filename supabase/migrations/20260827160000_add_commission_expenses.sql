alter table public.pdd_commissions
  add column if not exists insurance_cost numeric(14,2) not null default 0,
  add column if not exists receiving_labor_cost numeric(14,2) not null default 0,
  add column if not exists processing_labor_cost numeric(14,2) not null default 0,
  add column if not exists parts_cost numeric(14,2) not null default 0,
  add column if not exists shipping_labor_cost numeric(14,2) not null default 0,
  add column if not exists shipping_supplies_cost numeric(14,2) not null default 0,
  add column if not exists outgoing_freight_cost numeric(14,2) not null default 0,
  add column if not exists wire_fee numeric(14,2) not null default 0,
  add column if not exists miscellaneous_cost numeric(14,2) not null default 0;

alter table public.pdd_commissions drop constraint if exists pdd_commissions_expenses_nonnegative;
alter table public.pdd_commissions add constraint pdd_commissions_expenses_nonnegative check (
  insurance_cost >= 0 and receiving_labor_cost >= 0 and processing_labor_cost >= 0 and parts_cost >= 0 and
  shipping_labor_cost >= 0 and shipping_supplies_cost >= 0 and outgoing_freight_cost >= 0 and wire_fee >= 0 and miscellaneous_cost >= 0
);
