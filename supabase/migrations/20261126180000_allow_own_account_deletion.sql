begin;

grant delete on table public.accounts to authenticated;

create policy accounts_delete_own
  on public.accounts for delete to authenticated
  using ((select auth.uid()) = user_id);

commit;
