import type { SupabaseClient } from '@supabase/supabase-js'
import { readRows } from '../lib/readRows'
import type { OfflineSnapshot } from '../offline/snapshot'
import type { CategoryBudgetDraft, CategoryBudgetLimit } from './budgets'

const columns = 'id,category_id,effective_month,amount_kop::text'

export function loadCategoryBudgetLimits(client: SupabaseClient, signal?: AbortSignal, snapshot?: OfflineSnapshot) {
  return snapshot ? Promise.resolve(snapshot.category_budget_limits ?? [])
    : readRows<CategoryBudgetLimit>(client, 'category_budget_limits', columns, signal)
}

export async function saveCategoryBudgetLimit(client: SupabaseClient, categoryId: string, month: string, amount: bigint | null) {
  const { data, error } = await client.from('category_budget_limits')
    .upsert({ category_id: categoryId, effective_month: `${month}-01`, amount_kop: amount?.toString() ?? null },
      { onConflict: 'user_id,category_id,effective_month' })
    .select(columns).single().overrideTypes<CategoryBudgetLimit, { merge: false }>()
  if (error) throw error
  return data
}

export async function confirmCategoryBudgets(client: SupabaseClient, month: string, draft: readonly CategoryBudgetDraft[]) {
  const rows = draft.map(({ categoryId, amount }) => ({
    category_id: categoryId,
    effective_month: `${month}-01`,
    amount_kop: amount?.toString() ?? null,
  }))
  const { error } = await client.from('category_budget_limits').upsert(rows, {
    onConflict: 'user_id,category_id,effective_month',
    ignoreDuplicates: true,
  })
  if (error) throw error
}
