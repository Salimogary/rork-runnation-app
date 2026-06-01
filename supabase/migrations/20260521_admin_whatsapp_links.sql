create table if not exists public.admin_whatsapp_links (
  link_type text primary key,
  link text not null,
  updated_by uuid null references auth.users (id) on delete set null,
  updated_at timestamp with time zone not null default now(),
  constraint admin_whatsapp_links_type_check check (link_type in ('service_team', 'admins'))
);

create index if not exists idx_admin_whatsapp_links_updated_at
  on public.admin_whatsapp_links using btree (updated_at);
