select jsonb_pretty(jsonb_build_object(
  'format_version', 1,
  'exported_at', statement_timestamp(),
  'accounts', (
    select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object(
      'initial_balance_kop', a.initial_balance_kop::text
    ) order by a.id), '[]'::jsonb)
    from public.accounts a
  ),
  'categories', (
    select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb)
    from public.categories c
  ),
  'subcategories', (
    select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb)
    from public.subcategories s
  ),
  'transactions', (
    select coalesce(jsonb_agg((to_jsonb(t) - 'subcategory_reference') || jsonb_build_object(
      'amount_original_kop', t.amount_original_kop::text,
      'amount_uah_kop', t.amount_uah_kop::text,
      'rate', t.rate::text
    ) order by t.id), '[]'::jsonb)
    from public.transactions t
  ),
  'transfers', (
    select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object(
      'amount_uah_kop', t.amount_uah_kop::text
    ) order by t.id), '[]'::jsonb)
    from public.transfers t
  ),
  'recurring_templates', (
    select coalesce(jsonb_agg((to_jsonb(r) - 'subcategory_reference') || jsonb_build_object(
      'amount_original_kop', r.amount_original_kop::text,
      'rate', r.rate::text
    ) order by r.id), '[]'::jsonb)
    from public.recurring_templates r
  ),
  'category_budget_limits', (
    select coalesce(jsonb_agg(to_jsonb(l) || jsonb_build_object(
      'amount_kop', l.amount_kop::text
    ) order by l.category_id, l.effective_month), '[]'::jsonb)
    from public.category_budget_limits l
  ),
  'category_history', (
    select coalesce(jsonb_agg(to_jsonb(h) order by h.user_id, h.id), '[]'::jsonb)
    from public.category_history h
  )
)) as backup;
