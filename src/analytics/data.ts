import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCategories } from '../categories/data'
import { loadTransactions } from '../transactions/data'

type MonthSummary = {
  income: bigint
  expense: bigint
  expensesByCategory: Map<string, bigint>
}

export async function loadAnalytics(client: SupabaseClient, signal: AbortSignal) {
  const [transactions, categories] = await Promise.all([
    loadTransactions(client, signal),
    loadCategories(client, signal),
  ])
  const months = new Map<string, MonthSummary>()

  for (const transaction of transactions) {
    const month = transaction.date.slice(0, 7)
    let summary = months.get(month)
    if (!summary) {
      summary = { income: 0n, expense: 0n, expensesByCategory: new Map() }
      months.set(month, summary)
    }

    const amount = BigInt(transaction.amount_uah_kop)
    summary[transaction.type] += amount
    if (transaction.type === 'expense') {
      const categoryId = transaction.category_id
      const previous = summary.expensesByCategory.get(categoryId) ?? 0n
      summary.expensesByCategory.set(categoryId, previous + amount)
    }
  }

  return { months, categories }
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
