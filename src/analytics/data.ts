import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCategories } from '../categories/data'
import { loadSubcategories } from '../categories/subcategoryData'
import { isDateOnOrBefore } from '../lib/dates'
import type { OfflineSnapshot, TransactionOverlay } from '../offline/snapshot'
import { loadTransactions, type Transaction } from '../transactions/data'

type CategoryExpenses = {
  total: bigint
  entries: { transaction: Transaction; amount: bigint }[]
}

type AnalyticsTotals = {
  income: bigint
  expense: bigint
}

type AnalyticsSummary = AnalyticsTotals & {
  expensesByCategory: Map<string, CategoryExpenses>
}

export type AnalyticsPeriod = { from: string; to: string }

function emptySummary(): AnalyticsSummary {
  return { income: 0n, expense: 0n, expensesByCategory: new Map() }
}

function addTransaction(summary: AnalyticsSummary, transaction: Transaction, amount: bigint) {
  summary[transaction.type] += amount
  if (transaction.type !== 'expense') return

  let group = summary.expensesByCategory.get(transaction.category_id)
  if (!group) {
    group = { total: 0n, entries: [] }
    summary.expensesByCategory.set(transaction.category_id, group)
  }
  group.total += amount
  group.entries.push({ transaction, amount })
}

function sortExpenseEntries(summary: AnalyticsSummary) {
  for (const { entries } of summary.expensesByCategory.values()) {
    entries.sort((first, second) => {
      if (first.amount === second.amount) return second.transaction.date.localeCompare(first.transaction.date)
      return first.amount > second.amount ? -1 : 1
    })
  }
}

export async function loadAnalytics(client: SupabaseClient, signal: AbortSignal, snapshot?: OfflineSnapshot, overlay?: TransactionOverlay) {
  const [transactions, categories, subcategories] = await Promise.all([
    loadTransactions(client, signal, 'confirmed', snapshot, overlay),
    loadCategories(client, signal, snapshot),
    loadSubcategories(client, signal, snapshot),
  ])
  const months = new Map<string, AnalyticsSummary>()

  for (const transaction of transactions) {
    const month = transaction.date.slice(0, 7)
    let summary = months.get(month)
    if (!summary) {
      summary = emptySummary()
      months.set(month, summary)
    }

    addTransaction(summary, transaction, BigInt(transaction.amount_uah_kop))
  }

  for (const summary of months.values()) sortExpenseEntries(summary)
  return { transactions, months, categories, subcategories: subcategories ?? [] }
}

export function getAnalyticsPeriodError({ from, to }: AnalyticsPeriod, today: string): string {
  if (!isDateOnOrBefore(from) || !isDateOnOrBefore(to)) return 'Вкажи обидві коректні дати.'
  if (from > today || to > today) return 'Дати періоду мають бути не пізнішими за сьогодні.'
  if (from > to) return 'Дата закінчення має бути в день початку або пізніше.'
  return ''
}

export function summarizeAnalyticsPeriod(transactions: readonly Transaction[], { from, to }: AnalyticsPeriod) {
  const summary = emptySummary()
  const months = new Map<string, AnalyticsTotals>()
  for (const transaction of transactions) {
    if (transaction.date < from || transaction.date > to) continue
    const amount = BigInt(transaction.amount_uah_kop)
    addTransaction(summary, transaction, amount)

    const month = transaction.date.slice(0, 7)
    const totals = months.get(month) ?? { income: 0n, expense: 0n }
    totals[transaction.type] += amount
    months.set(month, totals)
  }

  sortExpenseEntries(summary)
  const comparison = [...months].sort(([first], [second]) => first.localeCompare(second))
    .map(([month, totals]) => ({ month, ...totals }))
  return { summary, comparison }
}

export function getComparisonMonths(lastMonth: string): string[] {
  const date = new Date(`${lastMonth}-01T00:00:00Z`)
  const months: string[] = []
  for (let index = 0; index < 6 && date.getUTCFullYear() >= 1; index += 1) {
    months.unshift(date.toISOString().slice(0, 7))
    date.setUTCMonth(date.getUTCMonth() - 1)
  }
  return months
}
