alter table public.admin_invites
  add column if not exists applicant_website_url text null,
  add column if not exists applicant_linkedin_url text null,
  add column if not exists applicant_social_url text null;
