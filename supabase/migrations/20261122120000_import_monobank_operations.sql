begin;

create function public.import_monobank_operation(
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
      id, user_id, account_id, category_id, type, date, status, currency,
      amount_original_kop, rate, purchase_name, comment
    )
    select p_id, owner_id, t.account_id, t.category_id, t.type, t.date, 'confirmed',
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

revoke all on function public.import_monobank_operation(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.import_monobank_operation(uuid, text, jsonb) to authenticated;

commit;
