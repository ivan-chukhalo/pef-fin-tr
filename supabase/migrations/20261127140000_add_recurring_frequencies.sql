begin;

alter table public.recurring_templates
  drop constraint recurring_templates_frequency_check,
  add constraint recurring_templates_frequency_check
    check (frequency in ('weekly', 'monthly', 'every_two_months', 'quarterly', 'semiannual', 'yearly'));

create or replace function public.sync_recurring_transactions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.transactions
    where user_id = old.user_id and template_id = old.id and status = 'planned';

    update public.transactions set template_id = null, occurrence_number = null
    where user_id = old.user_id and template_id = old.id and status = 'confirmed';

    return old;
  end if;

  delete from public.transactions
  where user_id = new.user_id and template_id = new.id
    and status = 'planned' and occurrence_number > new.occurrences;

  insert into public.transactions as transaction_row (
    user_id, account_id, category_id, subcategory_id, type, date, status, currency,
    amount_original_kop, rate, purchase_name, comment, template_id, occurrence_number
  )
  select
    new.user_id, new.account_id, new.category_id, new.subcategory_id, new.type,
    (new.start_date + (slot.number - 1) * (
      case new.frequency
        when 'weekly' then interval '1 week'
        when 'monthly' then interval '1 month'
        when 'every_two_months' then interval '2 months'
        when 'quarterly' then interval '3 months'
        when 'semiannual' then interval '6 months'
        when 'yearly' then interval '12 months'
      end
    ))::date,
    'planned', new.currency, new.amount_original_kop, new.rate, new.purchase_name,
    new.comment, new.id, slot.number
  from generate_series(1, new.occurrences) as slot(number)
  on conflict (user_id, template_id, occurrence_number) do update set
    account_id = excluded.account_id,
    category_id = excluded.category_id,
    subcategory_id = excluded.subcategory_id,
    type = excluded.type,
    date = excluded.date,
    currency = excluded.currency,
    amount_original_kop = excluded.amount_original_kop,
    rate = excluded.rate,
    purchase_name = excluded.purchase_name,
    comment = excluded.comment
  where transaction_row.status = 'planned';

  return new;
end;
$$;

commit;
