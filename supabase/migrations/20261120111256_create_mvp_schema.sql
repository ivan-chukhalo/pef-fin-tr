-- Перша міграція Supabase.
-- Створює таблиці MVP та відкриває лише потрібні операції для власника записів.

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id),
  name text not null check (btrim(name) <> ''),
  type text not null check (type in ('card', 'cash')),
  initial_balance_kop bigint not null default 0,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id),
  name text not null check (btrim(name) <> ''),
  type text not null check (type in ('income', 'expense')),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, id, type)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id),
  account_id uuid not null,
  category_id uuid not null,
  type text not null check (type in ('income', 'expense')),
  date date not null,
  currency text not null check (currency in ('UAH', 'USD')),
  amount_original_kop bigint not null check (amount_original_kop > 0),
  rate numeric not null check (rate > 0 and rate < 'Infinity'::numeric),
  amount_uah_kop bigint generated always as (
    round(amount_original_kop * rate)::bigint
  ) stored not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_date_not_future
    check (isfinite(date) and date <= (now() at time zone 'Europe/Kyiv')::date),
  constraint transactions_uah_rate check (currency <> 'UAH' or rate = 1),
  foreign key (user_id, account_id) references public.accounts (user_id, id),
  foreign key (user_id, category_id, type) references public.categories (user_id, id, type)
);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id),
  from_account_id uuid not null,
  to_account_id uuid not null,
  date date not null,
  amount_uah_kop bigint not null check (amount_uah_kop > 0),
  comment text,
  created_at timestamptz not null default now(),
  constraint transfers_date_not_future
    check (isfinite(date) and date <= (now() at time zone 'Europe/Kyiv')::date),
  constraint transfers_distinct_accounts check (from_account_id <> to_account_id),
  foreign key (user_id, from_account_id) references public.accounts (user_id, id),
  foreign key (user_id, to_account_id) references public.accounts (user_id, id)
);

create index transactions_user_date_idx on public.transactions (user_id, date);
create index transfers_user_date_idx on public.transfers (user_id, date);

create function public.set_transaction_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_transaction_updated_at();

revoke all on function public.set_transaction_updated_at() from public, anon, authenticated;

alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.transfers enable row level security;

-- Доступ у Data API потребує і дозволу на операцію, і виконання політики RLS.
revoke all on table public.accounts, public.categories, public.transactions, public.transfers
  from public, anon, authenticated;

grant select, insert, update on table public.accounts, public.categories to authenticated;
grant select, insert, update, delete on table public.transactions to authenticated;
grant select, insert on table public.transfers to authenticated;

create policy accounts_select_own
  on public.accounts for select to authenticated
  using (user_id = (select auth.uid()));

create policy accounts_insert_own
  on public.accounts for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy accounts_update_own
  on public.accounts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy categories_select_own
  on public.categories for select to authenticated
  using (user_id = (select auth.uid()));

create policy categories_insert_own
  on public.categories for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy categories_update_own
  on public.categories for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy transactions_select_own
  on public.transactions for select to authenticated
  using (user_id = (select auth.uid()));

create policy transactions_insert_own
  on public.transactions for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy transactions_update_own
  on public.transactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy transactions_delete_own
  on public.transactions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy transfers_select_own
  on public.transfers for select to authenticated
  using (user_id = (select auth.uid()));

create policy transfers_insert_own
  on public.transfers for insert to authenticated
  with check (user_id = (select auth.uid()));
