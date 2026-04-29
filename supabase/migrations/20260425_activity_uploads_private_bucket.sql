update storage.buckets
set public = false
where id in ('activity uploads', 'activity-uploads');
