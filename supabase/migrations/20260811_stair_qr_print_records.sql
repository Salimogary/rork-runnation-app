create table if not exists public.stair_qr_prints (
  print_id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.stair_routes(route_id) on delete cascade,
  registration_id text null,
  printed_by text null,
  print_source text not null default 'app_download',
  created_at timestamptz not null default now()
);

create index if not exists idx_stair_qr_prints_route_created
  on public.stair_qr_prints(route_id, created_at desc);

alter table public.stair_qr_prints enable row level security;

drop policy if exists "stair_qr_prints_read_authenticated" on public.stair_qr_prints;
create policy "stair_qr_prints_read_authenticated"
  on public.stair_qr_prints for select
  to authenticated
  using (true);
