update storage.buckets
set allowed_mime_types = array[
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
  'application/octet-stream'
]
where id = 'pdd-deal-uploads';
