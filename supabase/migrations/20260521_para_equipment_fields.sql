alter table public.registrations
  add column if not exists para_uses_equipment boolean not null default false,
  add column if not exists para_equipment_type text null,
  add column if not exists para_equipment_other text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'registrations_para_equipment_type_check'
  ) then
    alter table public.registrations
      add constraint registrations_para_equipment_type_check
      check (
        para_equipment_type is null
        or para_equipment_type in ('wheelchair', 'handcycle', 'prosthetic_blades', 'other')
      );
  end if;
end $$;

update public.registrations
set para_uses_equipment = false,
    para_equipment_type = null,
    para_equipment_other = null
where has_disability is distinct from true;

create index if not exists idx_registrations_para_equipment
on public.registrations (para_uses_equipment, para_equipment_type);
