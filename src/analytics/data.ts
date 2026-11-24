import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCategories } from '../categories/data'
import type { OfflineSnapshot, TransactionOverlay } from '../offline/snapshot'
import { loadTransactions, type Transaction } from '../transactions/data'

type CategoryExpenses = {
  total: bigint
  entries: { transaction: Transaction; amount: bigint }[]
}

type MonthSummary = {
  income: bigint
  expense: bigint
  expensesByCategory: Map<string, CategoryExpenses>
}

export async function loadAnalytics(client: SupabaseClient, signal: AbortSignal, snapshot?: OfflineSnapshot, overlay?: TransactionOverlay) {
  const [transactions, categories] = await Promise.all([
    loadTransactions(client, signal, 'confirmed', snapshot, overlay),
    loadCategories(client, signal, snapshot),
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
      let group = summary.expensesByCategory.get(categoryId)
      if (!group) {
        group = { total: 0n, entries: [] }
        summary.expensesByCategory.set(categoryId, group)
      }
      group.total += amount
      group.entries.push({ transaction, amount })
    }
  }

  for (const summary of months.values()) {
    for (const { entries } of summary.expensesByCategory.values()) {
      entries.sort((first, second) => {
        if (first.amount === second.amount) return second.transaction.date.localeCompare(first.transaction.date)
        return first.amount > second.amount ? -1 : 1
      })
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
