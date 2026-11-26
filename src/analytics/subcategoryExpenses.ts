import { getSubcategoryId } from '../categories/subcategories'
import type { Transaction } from '../transactions/data'

type Expense = { transaction: Transaction; amount: bigint }

export function groupExpensesBySubcategory(entries: readonly Expense[]) {
  const groups = new Map<string, { total: bigint; entries: Expense[] }>()
  for (const entry of entries) {
    const id = getSubcategoryId(entry.transaction.subcategory_id)
    const group = groups.get(id)
    if (group) {
      group.total += entry.amount
      group.entries.push(entry)
    } else {
      groups.set(id, { total: entry.amount, entries: [entry] })
    }
  }
  return [...groups].sort(([, first], [, second]) =>
    first.total === second.total ? 0 : first.total > second.total ? -1 : 1)
}
