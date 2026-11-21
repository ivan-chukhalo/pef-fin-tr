begin;

create table public.recurring_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id),
  account_id uuid not null,
  category_id uuid not null,
  type text not null check (type in ('income', 'expense')),
  currency text not null check (currency in ('UAH', 'USD')),
  amount_original_kop bigint not null check (amount_original_kop > 0),
  rate numeric not null check (rate > 0 and rate < 'Infinity'::numeric),
  purchase_name text check (purchase_name is null or type = 'expense'),
  comment text,
  frequency text not null check (frequency in ('weekly', 'monthly')),
  start_date date not null check (isfinite(start_date)),
  occurrences integer not null check (occurrences between 1 and 120),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  check (currency <> 'UAH' or rate = 1),
  foreign key (user_id, account_id) references public.accounts (user_id, id),
  foreign key (user_id, category_id, type) references public.categories (user_id, id, type)
);

alter table public.recurring_templates enable row level security;
revoke all on table public.recurring_templates from public, anon, authenticated;
grant select, insert, update, delete on table public.recurring_templates to authenticated;
create policy recurring_templates_own on public.recurring_templates
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.transactions
  add column template_id uuid,
  add column occurrence_number integer,
  add constraint transactions_template_owner_fk
    foreign key (user_id, template_id) references public.recurring_templates (user_id, id),
  add constraint transactions_template_occurrence_check check (
    (template_id is null) = (occurrence_number is null)
    and (occurrence_number is null or occurrence_number between 1 and 120)
  ),
  add constraint transactions_template_occurrence_unique unique (user_id, template_id, occurrence_number);

create function public.sync_recurring_transactions()
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
    user_id, account_id, category_id, type, date, status, currency,
    amount_original_kop, rate, purchase_name, comment, template_id, occurrence_number
  )
  select
    new.user_id, new.account_id, new.category_id, new.type,
    (new.start_date + (slot.number - 1) * (
      case when new.frequency = 'weekly' then interval '1 week' else interval '1 month' end
    ))::date,
    'planned', new.currency, new.amount_original_kop, new.rate, new.purchase_name,
    new.comment, new.id, slot.number
  from generate_series(1, new.occurrences) as slot(number)
  on conflict (user_id, template_id, occurrence_number) do update set
    account_id = excluded.account_id,
    category_id = excluded.category_id,
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

revoke all on function public.sync_recurring_transactions() from public, anon, authenticated;

create trigger recurring_templates_save_transactions
  after insert or update on public.recurring_templates
  for each row execute function public.sync_recurring_transactions();

create trigger recurring_templates_remove_transactions
  before delete on public.recurring_templates
  for each row execute function public.sync_recurring_transactions();

commit;
