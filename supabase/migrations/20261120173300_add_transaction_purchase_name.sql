alter table public.transactions
  add column purchase_name text,
  add constraint transactions_purchase_name_expense_only
    check (purchase_name is null or type = 'expense');
