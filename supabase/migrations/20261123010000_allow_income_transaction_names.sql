begin;

alter table public.transactions
  drop constraint transactions_purchase_name_expense_only;

alter table public.recurring_templates
  drop constraint recurring_templates_check;

commit;
