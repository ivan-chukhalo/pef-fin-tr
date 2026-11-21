begin;

alter table public.transactions
  add column status text not null default 'confirmed'
    check (status in ('planned', 'confirmed')),
  drop constraint transactions_date_not_future,
  add constraint transactions_confirmed_date_not_future
    check (
      isfinite(date)
      and (status = 'planned' or date <= (now() at time zone 'Europe/Kyiv')::date)
    );

alter table public.transfers
  add column status text not null default 'confirmed'
    check (status in ('planned', 'confirmed')),
  drop constraint transfers_date_not_future,
  add constraint transfers_confirmed_date_not_future
    check (
      isfinite(date)
      and (status = 'planned' or date <= (now() at time zone 'Europe/Kyiv')::date)
    );

commit;
