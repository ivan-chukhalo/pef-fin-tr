begin;

create table public.category_history (
  user_id uuid not null references auth.users (id),
  id uuid not null,
  state text not null check (state in ('used', 'deleted')),
  primary key (user_id, id)
);

alter table public.category_history enable row level security;
revoke all on table public.category_history from public, anon, authenticated;
grant select on table public.category_history to authenticated;

create policy category_history_select_own
  on public.category_history for select to authenticated
  using (user_id = (select auth.uid()));

insert into public.category_history (user_id, id, state)
select user_id, category_id, 'used' from public.transactions
union
select user_id, category_id, 'used' from public.recurring_templates;

create function public.record_category_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'categories' then
    if tg_op = 'INSERT' then
      -- Preserve deletions when an older client tries to seed the default ID.
      if exists (
        select 1 from public.category_history
        where user_id = new.user_id and id = new.id and state = 'deleted'
      ) then
        return null;
      end if;
      return new;
    end if;

    insert into public.category_history (user_id, id, state)
    values (old.user_id, old.id, 'deleted')
    on conflict (user_id, id) do nothing;

    if not found then
      raise exception 'A used category cannot be deleted' using errcode = '23503';
    end if;
    return old;
  end if;

  insert into public.category_history (user_id, id, state)
  values (new.user_id, new.category_id, 'used')
  on conflict (user_id, id) do nothing;
  return new;
end;
$$;

revoke all on function public.record_category_history() from public, anon, authenticated;

create trigger categories_skip_deleted_id
  before insert on public.categories
  for each row execute function public.record_category_history();

create trigger categories_record_deletion
  after delete on public.categories
  for each row execute function public.record_category_history();

create trigger transactions_record_category_use
  after insert or update of category_id, user_id on public.transactions
  for each row execute function public.record_category_history();

create trigger recurring_templates_record_category_use
  after insert or update of category_id, user_id on public.recurring_templates
  for each row execute function public.record_category_history();

grant delete on table public.categories to authenticated;

create policy categories_delete_unused_own
  on public.categories for delete to authenticated
  using (
    user_id = (select auth.uid()) and not exists (
      select 1 from public.category_history as history
      where history.user_id = categories.user_id and history.id = categories.id
    )
  );

commit;