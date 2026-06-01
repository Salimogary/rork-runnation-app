insert into public.roles (role_name)
values ('smartfit_club_coordinator')
on conflict (role_name) do nothing;

update public.roles
set is_exclusive_admin_role = true
where role_name = 'smartfit_club_coordinator';
