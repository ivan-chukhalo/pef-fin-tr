begin;

create table public.subcategories (
  id uuid primary key default gen_random_uuid() check (id <> '00000000-0000-0000-0000-000000000000'::uuid),
  user_id uuid not null default auth.uid() references auth.users (id),
  category_id uuid not null,
  category_type text not null,
  name text not null check (
    btrim(name) <> '' and lower(translate(btrim(name), 'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯ', 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя')) <> 'без підкатегорії'
  ),
  is_hidden boolean not null default false,
  unique (user_id, category_id, id),
  foreign key (user_id, category_id, category_type)
    references public.categories (user_id, id, type) on delete cascade
);

create unique index subcategories_unique_name
  on public.subcategories (user_id, category_id, lower(translate(btrim(name), 'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯ', 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя')));

alter table public.subcategories enable row level security;
revoke all on table public.subcategories from public, anon, authenticated;
grant select, insert, update on table public.subcategories to authenticated;
create policy subcategories_own on public.subcategories for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- The reserved identifier represents "Без підкатегорії" without creating a row.
alter table public.transactions
  add column subcategory_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid,
  add column subcategory_reference uuid generated always as (nullif(subcategory_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  add constraint transactions_subcategory_fkey foreign key (user_id, category_id, subcategory_reference)
    references public.subcategories (user_id, category_id, id);

alter table public.recurring_templates
  add column subcategory_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid,
  add column subcategory_reference uuid generated always as (nullif(subcategory_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  add constraint recurring_templates_subcategory_fkey foreign key (user_id, category_id, subcategory_reference)
    references public.subcategories (user_id, category_id, id);

-- Older clients can change a category while leaving its previous subcategory in place.
create function public.reset_subcategory_on_category_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category_id is distinct from old.category_id
    and new.subcategory_id = old.subcategory_id then
    new.subcategory_id := '00000000-0000-0000-0000-000000000000'::uuid;
  end if;
  return new;
end;
$$;

revoke all on function public.reset_subcategory_on_category_change() from public, anon, authenticated;

create trigger transactions_reset_subcategory
  before update of category_id on public.transactions
  for each row execute function public.reset_subcategory_on_category_change();

create trigger recurring_templates_reset_subcategory
  before update of category_id on public.recurring_templates
  for each row execute function public.reset_subcategory_on_category_change();

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
      case when new.frequency = 'weekly' then interval '1 week' else interval '1 month' end
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

create or replace function public.import_monobank_operation(
  p_id uuid,
  p_kind text,
  p_fields jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_id is null or p_kind is null or p_kind not in ('transaction', 'transfer')
    or jsonb_typeof(p_fields) is distinct from 'object'
  then
    raise exception 'Invalid bank operation' using errcode = '22023';
  end if;

  -- The same bank operation can be classified into either table. Serialize
  -- attempts with its stable ID before checking both tables.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || ':' || p_id::text, 0));
  lock table public.transactions, public.transfers in row exclusive mode;
  if exists (select 1 from public.transactions where user_id = owner_id and id = p_id)
    or exists (select 1 from public.transfers where user_id = owner_id and id = p_id)
  then
    return false;
  end if;

  if p_kind = 'transaction' then
    insert into public.transactions (
      id, user_id, account_id, category_id, subcategory_id, type, date, status, currency,
      amount_original_kop, rate, purchase_name, comment
    )
    select p_id, owner_id, t.account_id, t.category_id, coalesce(t.subcategory_id, '00000000-0000-0000-0000-000000000000'::uuid),
      t.type, t.date, 'confirmed',
      t.currency, t.amount_original_kop, t.rate, t.purchase_name, t.comment
    from jsonb_populate_record(null::public.transactions, p_fields) as t;
  else
    insert into public.transfers (
      id, user_id, from_account_id, to_account_id, date, status, amount_uah_kop, comment
    )
    select p_id, owner_id, t.from_account_id, t.to_account_id, t.date, 'confirmed',
      t.amount_uah_kop, t.comment
    from jsonb_populate_record(null::public.transfers, p_fields) as t;
  end if;
  return true;
end;
$$;

create or replace function public.export_backup()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'format_version', 1,
    'exported_at', statement_timestamp(),
    'accounts', (
      select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object(
        'initial_balance_kop', a.initial_balance_kop::text
      ) order by a.id), '[]'::jsonb)
      from public.accounts a where a.user_id = (select auth.uid())
    ),
    'categories', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb)
      from public.categories c where c.user_id = (select auth.uid())
    ),
    'subcategories', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb)
      from public.subcategories s where s.user_id = (select auth.uid())
    ),
    'transactions', (
      select coalesce(jsonb_agg((to_jsonb(t) - 'subcategory_reference') || jsonb_build_object(
        'amount_original_kop', t.amount_original_kop::text,
        'amount_uah_kop', t.amount_uah_kop::text,
        'rate', t.rate::text
      ) order by t.id), '[]'::jsonb)
      from public.transactions t where t.user_id = (select auth.uid())
    ),
    'transfers', (
      select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object(
        'amount_uah_kop', t.amount_uah_kop::text
      ) order by t.id), '[]'::jsonb)
      from public.transfers t where t.user_id = (select auth.uid())
    ),
    'recurring_templates', (
      select coalesce(jsonb_agg((to_jsonb(r) - 'subcategory_reference') || jsonb_build_object(
        'amount_original_kop', r.amount_original_kop::text,
        'rate', r.rate::text
      ) order by r.id), '[]'::jsonb)
      from public.recurring_templates r where r.user_id = (select auth.uid())
    ),
    'category_budget_limits', (
      select coalesce(jsonb_agg(to_jsonb(l) || jsonb_build_object(
        'amount_kop', l.amount_kop::text
      ) order by l.category_id, l.effective_month), '[]'::jsonb)
      from public.category_budget_limits l where l.user_id = (select auth.uid())
    ),
    'category_history', (
      select coalesce(jsonb_agg(to_jsonb(h) order by h.user_id, h.id), '[]'::jsonb)
      from public.category_history h where h.user_id = (select auth.uid())
    )
  );
$$;

create or replace function public.list_backup_versions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  cutoff timestamptz := clock_timestamp() - interval '30 days';
begin
  if owner_id is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  delete from public.backup_versions
  where user_id = owner_id and created_at <= cutoff;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id,
      'created_at', v.created_at,
      'accounts', jsonb_array_length(v.snapshot->'accounts'),
      'categories', jsonb_array_length(v.snapshot->'categories'),
      'subcategories', coalesce(jsonb_array_length(v.snapshot->'subcategories'), 0),
      'transactions', jsonb_array_length(v.snapshot->'transactions'),
      'transfers', jsonb_array_length(v.snapshot->'transfers'),
      'recurring_templates', jsonb_array_length(v.snapshot->'recurring_templates'),
      'category_budget_limits', coalesce(jsonb_array_length(v.snapshot->'category_budget_limits'), 0)
    ) order by v.created_at desc, v.id), '[]'::jsonb)
    from public.backup_versions v
    where v.user_id = owner_id and v.created_at > cutoff
  );
end;
$$;

create or replace function public.restore_backup(
  p_request_id uuid,
  p_backup jsonb default null,
  p_version_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  incoming jsonb := p_backup;
  saved_at timestamptz;
begin
  if owner_id is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_request_id is null or (p_backup is null) = (p_version_id is null) then
    raise exception 'Select one backup source' using errcode = '22023';
  end if;

  -- Serialize data replacement against each regular write, including template
  -- writes that in turn write transactions and category history.
  lock table public.recurring_templates, public.accounts, public.categories, public.subcategories,
    public.transactions, public.transfers, public.category_history,
    public.category_budget_limits in share row exclusive mode;

  saved_at := clock_timestamp();
  delete from public.backup_versions
  where user_id = owner_id and created_at <= saved_at - interval '30 days';
  if exists (
    select 1 from public.backup_versions where user_id = owner_id and id = p_request_id
  ) then
    return;
  end if;

  if p_version_id is not null then
    select v.snapshot into incoming
    from public.backup_versions v
    where v.user_id = owner_id and v.id = p_version_id
      and v.created_at > saved_at - interval '30 days';
    if not found then
      raise exception 'Backup version is unavailable' using errcode = 'P0002';
    end if;
  end if;

  if jsonb_typeof(incoming) is distinct from 'object'
    or incoming->'format_version' is distinct from '1'::jsonb
    or jsonb_typeof(incoming->'exported_at') is distinct from 'string'
    or not isfinite((incoming->>'exported_at')::timestamptz)
    or (incoming ? 'subcategories' and jsonb_typeof(incoming->'subcategories') is distinct from 'array')
    or (incoming ? 'category_budget_limits'
      and jsonb_typeof(incoming->'category_budget_limits') is distinct from 'array')
    or exists (
      select 1 from unnest(array['accounts', 'categories', 'transactions', 'transfers',
        'recurring_templates', 'category_history']) as collections(key)
      where jsonb_typeof(incoming->key) is distinct from 'array'
    )
  then
    raise exception 'Invalid backup format' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_populate_recordset(null::public.transactions, incoming->'transactions') as t
    where t.amount_uah_kop is null
      or t.amount_uah_kop::numeric is distinct from round(t.amount_original_kop * t.rate)
  ) then
    raise exception 'Invalid stored transaction amount' using errcode = '22023';
  end if;

  insert into public.backup_versions (user_id, id, created_at, snapshot)
  values (owner_id, p_request_id, saved_at,
    jsonb_set(public.export_backup(), '{exported_at}', to_jsonb(saved_at)));

  delete from public.transactions where user_id = owner_id;
  delete from public.transfers where user_id = owner_id;
  delete from public.recurring_templates where user_id = owner_id;
  -- Category deletes create tombstones. Clear the old history before deleting
  -- categories, then clear those interim tombstones before restoring.
  delete from public.category_history where user_id = owner_id;
  delete from public.categories where user_id = owner_id;
  delete from public.category_history where user_id = owner_id;
  delete from public.accounts where user_id = owner_id;

  insert into public.accounts (id, user_id, name, type, initial_balance_kop, is_hidden, created_at)
  select a.id, owner_id, a.name, a.type, a.initial_balance_kop, a.is_hidden, a.created_at
  from jsonb_populate_recordset(null::public.accounts, incoming->'accounts') as a;

  insert into public.categories (id, user_id, name, type, is_hidden, created_at, color)
  select c.id, owner_id, c.name, c.type, c.is_hidden, c.created_at, c.color
  from jsonb_populate_recordset(null::public.categories, incoming->'categories') as c;

  insert into public.subcategories (id, user_id, category_id, category_type, name, is_hidden)
  select s.id, owner_id, s.category_id, s.category_type, s.name, s.is_hidden
  from jsonb_populate_recordset(null::public.subcategories, coalesce(incoming->'subcategories', '[]'::jsonb)) as s;

  insert into public.category_budget_limits (id, user_id, category_id, effective_month, amount_kop)
  select l.id, owner_id, l.category_id, l.effective_month, l.amount_kop
  from jsonb_populate_recordset(null::public.category_budget_limits,
    coalesce(incoming->'category_budget_limits', '[]'::jsonb)) as l;

  insert into public.recurring_templates (id, user_id, account_id, category_id, subcategory_id, type, currency,
    amount_original_kop, rate, purchase_name, comment, frequency, start_date, occurrences, created_at)
  select r.id, owner_id, r.account_id, r.category_id, coalesce(r.subcategory_id, '00000000-0000-0000-0000-000000000000'::uuid), r.type, r.currency, r.amount_original_kop,
    r.rate, r.purchase_name, r.comment, r.frequency, r.start_date, r.occurrences, r.created_at
  from jsonb_populate_recordset(null::public.recurring_templates, incoming->'recurring_templates') as r;

  -- Replace generated rows with the exact series and statuses from the backup.
  delete from public.transactions where user_id = owner_id and template_id is not null;
  insert into public.transactions (id, user_id, account_id, category_id, subcategory_id, type, date, status, currency,
    amount_original_kop, rate, purchase_name, comment, created_at, updated_at, template_id, occurrence_number)
  select t.id, owner_id, t.account_id, t.category_id, coalesce(t.subcategory_id, '00000000-0000-0000-0000-000000000000'::uuid), t.type, t.date, t.status, t.currency,
    t.amount_original_kop, t.rate, t.purchase_name, t.comment,
    t.created_at, t.updated_at, t.template_id, t.occurrence_number
  from jsonb_populate_recordset(null::public.transactions, incoming->'transactions') as t;

  insert into public.transfers (id, user_id, from_account_id, to_account_id, date, status, amount_uah_kop, comment, created_at)
  select t.id, owner_id, t.from_account_id, t.to_account_id, t.date, t.status, t.amount_uah_kop, t.comment, t.created_at
  from jsonb_populate_recordset(null::public.transfers, incoming->'transfers') as t;

  delete from public.category_history where user_id = owner_id;
  insert into public.category_history (user_id, id, state)
  select owner_id, h.id, h.state
  from jsonb_populate_recordset(null::public.category_history, incoming->'category_history') as h;

  if exists (
    select 1 from public.category_history h
    left join public.categories c on c.user_id = h.user_id and c.id = h.id
    where h.user_id = owner_id and (h.state = 'used') <> (c.id is not null)
  ) or exists (
    select 1 from (
      select category_id from public.transactions where user_id = owner_id
      union
      select category_id from public.recurring_templates where user_id = owner_id
    ) as referenced
    where not exists (
      select 1 from public.category_history h
      where h.user_id = owner_id and h.id = referenced.category_id and h.state = 'used'
    )
  ) then
    raise exception 'Invalid category history' using errcode = '22023';
  end if;
end;
$$;

commit;
