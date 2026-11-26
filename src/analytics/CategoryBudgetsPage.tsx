import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CategoryLabel from '../categories/CategoryLabel'
import { formatMonth } from '../lib/dates'
import { formatKopecks } from '../lib/money'
import { useLoadData } from '../lib/useLoadData'
import { useKyivToday } from '../lib/useKyivToday'
import type { OfflinePageProps } from '../offline/snapshot'
import { confirmCategoryBudgets, loadCategoryBudgetLimits, saveCategoryBudgetLimit } from './budgetData'
import { getBudgetMonths, getCategoryBudgets, hasConfirmedBudgetMonth, previousBudgetMonth, type CategoryBudgetDraft } from './budgets'
import CategoryBudgetEditor from './CategoryBudgetEditor'
import CategoryBudgetProgress from './CategoryBudgetProgress'
import { loadAnalytics } from './data'
import MonthlyBudgetReview from './MonthlyBudgetReview'

const linkClass = 'inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-emerald-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300'

export default function CategoryBudgetsPage({ client, snapshot, transactionOverlay }: OfflinePageProps) {
  const [params, setParams] = useSearchParams()
  const currentMonth = useKyivToday().slice(0, 7)
  const load = useCallback((signal: AbortSignal) => loadAnalytics(client, signal, snapshot, transactionOverlay), [client, snapshot, transactionOverlay])
  const { data, hasError, retry } = useLoadData(load)
  const loadLimits = useCallback((signal: AbortSignal) => loadCategoryBudgetLimits(client, signal, snapshot), [client, snapshot])
  const { data: limits, setData: setLimits, hasError: limitsError, retry: retryLimits } = useLoadData(loadLimits)

  if (!data || !limits) {
    return hasError || limitsError ? (
      <div className="mt-6 space-y-2">
        <p role="alert" className="text-sm text-rose-300">Не вдалося завантажити ліміти.</p>
        <button type="button" className={linkClass} onClick={() => {
          retry()
          retryLimits()
        }}>
          Спробувати ще раз
        </button>
      </div>
    ) : <p role="status" className="mt-6 text-sm text-zinc-400">Завантажуємо ліміти…</p>
  }

  const months = [...new Set([...getBudgetMonths(limits, currentMonth), ...data.months.keys()])]
    .sort((first, second) => second.localeCompare(first))
  const requestedMonth = params.get('month')
  const month = requestedMonth && months.includes(requestedMonth) ? requestedMonth : currentMonth
  const needsConfirmation = month === currentMonth && !hasConfirmedBudgetMonth(limits, month)
  const budgets = getCategoryBudgets(limits, month)
  const categories = new Map(data.categories.map((category) => [category.id, category]))
  const expenses = data.months.get(month)?.expensesByCategory
  const rows = [...budgets].map(([categoryId, limit]) => {
    const category = categories.get(categoryId)
    const group = expenses?.get(categoryId)
    return { categoryId, category, limit, spent: group?.total ?? 0n, hasTransactions: !!group?.entries.length }
  }).sort((first, second) => first.spent === second.spent
    ? (first.category?.name ?? '').localeCompare(second.category?.name ?? '', 'uk-UA')
    : first.spent > second.spent ? -1 : 1)

  async function saveBudget(categoryId: string, amount: bigint | null) {
    const saved = await saveCategoryBudgetLimit(client, categoryId, month, amount)
    setLimits((current) => [...(current ?? []).filter((limit) => limit.id !== saved.id), saved])
  }

  async function confirmBudget(draft: readonly CategoryBudgetDraft[]) {
    await confirmCategoryBudgets(client, month, draft)
    setLimits(await loadCategoryBudgetLimits(client))
  }

  return (
    <div className="mt-6 max-w-3xl space-y-5">
      <label className="grid w-full max-w-64 gap-2 text-sm font-medium">
        Місяць
        <select value={month} onChange={(event) => setParams({ month: event.target.value }, { replace: true })}
          className="min-h-11 w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30">
          {months.map((key) => <option key={key} value={key}>{formatMonth(key)}</option>)}
        </select>
      </label>
      {needsConfirmation && (snapshot ? (
        <p className="text-sm text-zinc-400">Підключися до інтернету, щоб підтвердити ліміти на цей місяць.</p>
      ) : (
        <MonthlyBudgetReview key={month} categories={data.categories} previous={getCategoryBudgets(limits, previousBudgetMonth(month))}
          onConfirm={confirmBudget} />
      ))}
      {!snapshot && month === currentMonth && !needsConfirmation && (
        <CategoryBudgetEditor key={month} categories={data.categories} budgets={budgets} onSave={saveBudget} />
      )}
      {rows.length ? (
        <ul aria-label="Ліміти за категоріями" className="grid gap-3">
          {rows.map(({ categoryId, category, limit, spent, hasTransactions }) => {
            const name = category?.name ?? 'Категорія'
            return (
              <li key={categoryId} className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 [overflow-wrap:anywhere] sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <CategoryLabel name={name} color={category?.color} />
                  <span className="font-semibold tabular-nums">
                    <span className="text-xs font-normal text-zinc-400">Факт </span>
                    {formatKopecks(spent)}
                  </span>
                </div>
                <CategoryBudgetProgress spent={spent} limit={limit} />
                {hasTransactions && (
                  <Link to={`/transactions?${new URLSearchParams({ month, category: categoryId })}`} className={linkClass}
                    aria-label={`Транзакції в категорії «${name}»`}>Транзакції</Link>
                )}
              </li>
            )
          })}
        </ul>
      ) : <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">За цей місяць лімітів немає.</p>}
    </div>
  )
}
