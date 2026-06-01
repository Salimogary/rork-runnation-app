alter table public.admin_invites
  add column if not exists applicant_statement text null;

comment on column public.admin_invites.applicant_statement is
  'Optional 50-250 word applicant statement explaining why the user should be considered for the requested service role. Admins should clear or delete this after the role request is no longer needed.';
