create or replace function public.get_uuid_pk_default_health()
returns table (
  table_name text,
  column_name text,
  default_expression text,
  has_default boolean
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    cls.relname::text as table_name,
    attr.attname::text as column_name,
    pg_get_expr(def.adbin, def.adrelid)::text as default_expression,
    (def.adbin is not null) as has_default
  from pg_class cls
  join pg_namespace ns
    on ns.oid = cls.relnamespace
  join pg_index idx
    on idx.indrelid = cls.oid
   and idx.indisprimary = true
  join pg_attribute attr
    on attr.attrelid = cls.oid
   and attr.attnum = any(idx.indkey)
   and not attr.attisdropped
  left join pg_attrdef def
    on def.adrelid = cls.oid
   and def.adnum = attr.attnum
  where ns.nspname = 'public'
    and cls.relkind = 'r'
    and attr.atttypid = 'uuid'::regtype
    and def.adbin is null
  order by cls.relname, attr.attname;
$$;
