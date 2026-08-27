create index if not exists pdd_deal_uploads_uploaded_by_idx
  on public.pdd_deal_uploads (uploaded_by);

create index if not exists pdd_deal_uploads_mapping_reviewed_by_idx
  on public.pdd_deal_uploads (mapping_reviewed_by)
  where mapping_reviewed_by is not null;

create index if not exists pdd_public_deals_created_by_idx
  on public.pdd_public_deals (created_by);
