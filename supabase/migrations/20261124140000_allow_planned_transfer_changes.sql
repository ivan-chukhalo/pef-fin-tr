begin;

alter table public.transfers
  add column updated_at timestamptz not null default now();

create trigger transfers_set_updated_at
  before update on public.transfers
  for each row execute function public.set_transaction_updated_at();

grant update (from_account_id, to_account_id, date, amount_uah_kop, comment)
  on public.transfers to authenticated;
grant delete on public.transfers to authenticated;

create policy transfers_update_own_planned on public.transfers
  for update to authenticated
  using (user_id = (select auth.uid()) and status = 'planned')
  with check (user_id = (select auth.uid()) and status = 'planned');

create policy transfers_delete_own_planned on public.transfers
  for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'planned');

create function public.check_planned_operation_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' or new.status <> 'planned' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.status = old.status and new.date = old.date then
      return new;
    end if;
  end if;
  if new.date <= (now() at time zone 'Europe/Kyiv')::date then
    raise check_violation using
      message = 'Planned operation requires a future Kyiv date',
      constraint = 'planned_operation_future_date';
  end if;
  return new;
end;
$$;

revoke all on function public.check_planned_operation_date()
  from public, anon, authenticated;

create trigger transfers_future_planned_date
  before insert or update of status, date on public.transfers
  for each row execute function public.check_planned_operation_date();

create trigger transactions_future_planned_date
  before insert or update of status, date on public.transactions
  for each row when (new.template_id is null)
  execute function public.check_planned_operation_date();

commit;
