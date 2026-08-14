alter table public.running_budget_goal
  add column if not exists event_expenses_amount numeric not null default 0,
  add column if not exists gear_amount numeric not null default 0,
  add column if not exists registrations_amount numeric not null default 0;

update public.running_budget_goal
set event_expenses_amount = budget_amount
where event_expenses_amount = 0
  and gear_amount = 0
  and registrations_amount = 0
  and budget_amount > 0;
