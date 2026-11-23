begin;

alter table public.categories
  add column color text,
  add constraint categories_color_hex_check
    check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

-- Preserve category colors in restored backups. A missing color becomes null.
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
  lock table public.recurring_templates, public.accounts, public.categories,
    public.transactions, public.transfers, public.category_history in share row exclusive mode;

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

  insert into public.recurring_templates (id, user_id, account_id, category_id, type, currency,
    amount_original_kop, rate, purchase_name, comment, frequency, start_date, occurrences, created_at)
  select r.id, owner_id, r.account_id, r.category_id, r.type, r.currency, r.amount_original_kop,
    r.rate, r.purchase_name, r.comment, r.frequency, r.start_date, r.occurrences, r.created_at
  from jsonb_populate_recordset(null::public.recurring_templates, incoming->'recurring_templates') as r;

  -- Replace generated rows with the exact series and statuses from the backup.
  delete from public.transactions where user_id = owner_id and template_id is not null;
  insert into public.transactions (id, user_id, account_id, category_id, type, date, status, currency,
    amount_original_kop, rate, purchase_name, comment, created_at, updated_at, template_id, occurrence_number)
  select t.id, owner_id, t.account_id, t.category_id, t.type, t.date, t.status, t.currency,
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
