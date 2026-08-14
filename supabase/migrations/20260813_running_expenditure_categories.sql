update public.goals
set goal = 'Manage running Expenditure'
where goal_id = 9;

alter table public.running_budget_expenses
  drop constraint if exists running_budget_expenses_category_check;

alter table public.running_budget_expenses
  add constraint running_budget_expenses_category_check
  check (
    category in (
      'Event expenses',
      'Gear',
      'Registrations',
      'Race registration',
      'Transport',
      'Lodging',
      'Shoes',
      'Watch',
      'Electrolytes',
      'Other'
    )
  );
