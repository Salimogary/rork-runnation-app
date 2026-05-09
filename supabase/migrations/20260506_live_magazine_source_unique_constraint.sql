with duplicates as (
  select
    article_id,
    row_number() over (
      partition by source_table, source_id
      order by updated_at desc nulls last, created_at desc nulls last, article_id
    ) as duplicate_rank
  from public.live_magazine
  where source_table is not null
    and source_id is not null
)
delete from public.live_magazine
where article_id in (
  select article_id
  from duplicates
  where duplicate_rank > 1
);

drop index if exists public.idx_live_magazine_source;

create unique index if not exists live_magazine_source_table_source_id_key
  on public.live_magazine(source_table, source_id);
