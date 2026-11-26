import type { Category } from '../categories/data'

export const categoryBudgetsPath = '/more/budgets'

export type CategoryBudgetLimit = {
  id: string
  category_id: string
  effective_month: string
  amount_kop: string | null
}

export type CategoryBudgetDraft = { categoryId: string; amount: bigint | null }

export function getBudgetCategories(categories: readonly Category[], budgets: ReadonlyMap<string, bigint>) {
  return categories.filter(({ id, type, is_hidden }) => type === 'expense' && (!is_hidden || budgets.has(id)))
    .sort((first, second) => first.name.localeCompare(second.name, 'uk-UA'))
}

export function hasConfirmedBudgetMonth(limits: readonly CategoryBudgetLimit[], month: string) {
  return limits.some(({ effective_month }) => effective_month === `${month}-01`)
}

export function previousBudgetMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() - 1)
  return date.toISOString().slice(0, 7)
}

export function getCategoryBudgets(limits: readonly CategoryBudgetLimit[], month: string) {
  const effectiveDate = `${month}-01`
  const latestByCategory = new Map<string, CategoryBudgetLimit>()

  for (const limit of limits) {
    if (limit.effective_month > effectiveDate) continue
    const latest = latestByCategory.get(limit.category_id)
    if (!latest || limit.effective_month > latest.effective_month) latestByCategory.set(limit.category_id, limit)
  }

  const budgets = new Map<string, bigint>()
  for (const [categoryId, limit] of latestByCategory) {
    if (limit.amount_kop !== null) budgets.set(categoryId, BigInt(limit.amount_kop))
  }
  return budgets
}

export function getBudgetMonths(limits: readonly CategoryBudgetLimit[], currentMonth: string) {
  let firstMonth = currentMonth
  for (const { effective_month } of limits) {
    const month = effective_month.slice(0, 7)
    if (month < firstMonth) firstMonth = month
  }

  const months: string[] = []
  const end = new Date(`${currentMonth}-01T00:00:00Z`)
  const date = new Date(`${firstMonth}-01T00:00:00Z`)
  while (date <= end) {
    months.push(date.toISOString().slice(0, 7))
    date.setUTCMonth(date.getUTCMonth() + 1)
  }
  return months
}

export function getBudgetUsage(spent: bigint, limit: bigint) {
  const tenths = spent * 1_000n / limit
  const whole = (tenths / 10n).toLocaleString('uk-UA')
  const decimal = tenths % 10n

  return {
    remaining: limit - spent,
    percent: `${whole}${decimal ? `,${decimal}` : ''}%`,
    barWidth: Number(tenths > 1_000n ? 1_000n : tenths) / 10,
  }
}
