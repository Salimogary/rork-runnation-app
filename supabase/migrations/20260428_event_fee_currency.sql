begin;

alter table public.countries
  add column if not exists currency_code text null;

alter table public.events
  add column if not exists entry_fee numeric(12,2) null,
  add column if not exists currency_code text null;

update public.countries
set currency_code = case upper(iso_alpha2)
  when 'UG' then 'UGX'
  when 'KE' then 'KES'
  when 'TZ' then 'TZS'
  when 'RW' then 'RWF'
  when 'ZA' then 'ZAR'
  when 'US' then 'USD'
  when 'GB' then 'GBP'
  when 'EU' then 'EUR'
  else currency_code
end
where currency_code is null;

update public.events
set currency_code = coalesce(currency_code, 'UGX')
where entry = 'paid'
  and currency_code is null;

comment on column public.countries.currency_code is
'Default event currency for the country.';

comment on column public.events.entry_fee is
'Fee charged for a paid event entry.';

comment on column public.events.currency_code is
'Currency used for the event entry fee, defaulted from the selected country.';

commit;
