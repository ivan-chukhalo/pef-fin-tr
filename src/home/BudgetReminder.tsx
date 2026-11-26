import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { loadCategoryBudgetLimits } from '../analytics/budgetData'
import { categoryBudgetsPath, hasConfirmedBudgetMonth } from '../analytics/budgets'
import { formatMonth } from '../lib/dates'
import { useKyivToday } from '../lib/useKyivToday'
import { useLoadData } from '../lib/useLoadData'
import type { OfflinePageProps } from '../offline/snapshot'

export default function BudgetReminder({ client, snapshot }: Pick<OfflinePageProps, 'client' | 'snapshot'>) {
  const month = useKyivToday().slice(0, 7)
  const load = useCallback((signal: AbortSignal) => loadCategoryBudgetLimits(client, signal, snapshot), [client, snapshot])
  const { data } = useLoadData(load)
  if (!data || hasConfirmedBudgetMonth(data, month)) return null

  return (
    <section aria-labelledby="home-budget-reminder" className="flex flex-wrap items-center justify-between gap-x-4 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-2 sm:px-5">
      <h2 id="home-budget-reminder" className="text-sm font-semibold">Підтвердь ліміти на {formatMonth(month)}</h2>
      <Link to={categoryBudgetsPath} className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-emerald-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
        Переглянути ліміти
      </Link>
    </section>
  )
}
