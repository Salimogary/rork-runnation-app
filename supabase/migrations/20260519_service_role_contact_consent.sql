alter table public.admin_invites
  add column if not exists applicant_contact_consent boolean not null default false,
  add column if not exists applicant_contact_instructions text null;

comment on column public.admin_invites.applicant_contact_consent is
  'Whether the applicant asked to be contacted if selected for the requested service role.';

comment on column public.admin_invites.applicant_contact_instructions is
  'Optional applicant-provided contact instructions, for example WhatsApp me on +256...; clear or delete after no longer needed.';
