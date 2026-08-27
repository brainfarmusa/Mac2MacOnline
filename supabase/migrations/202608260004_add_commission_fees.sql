alter table public.pdd_commissions
  add column if not exists shipping_cost numeric(14,2) not null default 0,
  add column if not exists credit_card_fee numeric(14,2) not null default 0;

alter table public.pdd_commissions
  drop constraint if exists pdd_commissions_fees_nonnegative,
  add constraint pdd_commissions_fees_nonnegative check (shipping_cost >= 0 and credit_card_fee >= 0);
