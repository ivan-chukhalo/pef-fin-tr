import type { Category } from '../categories/data'
import { getSubcategoryName, type Subcategory } from '../categories/subcategories'
import { formatDate } from '../lib/dates'
import { formatKopecks } from '../lib/money'
import type { Transaction } from '../transactions/data'
import { getTransactionLabels } from '../transactions/labels'
import { groupExpensesBySubcategory } from './subcategoryExpenses'

export default function CategoryExpenseGroups({ category, entries, subcategories }: {
  category: Category | undefined
  entries: readonly { transaction: Transaction; amount: bigint }[]
  subcategories: ReadonlyMap<string, Subcategory>
}) {
  const groups = groupExpensesBySubcategory(entries)
  return (
    <ul aria-label={`Підкатегорії — ${category?.name ?? 'Категорія'}`}
      className="divide-y divide-zinc-800 border-t border-zinc-800">
      {groups.map(([id, group]) => {
        const name = getSubcategoryName(id, subcategories)
        return (
          <li key={id}>
            <details open={groups.length === 1}>
              <summary className="cursor-pointer px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-300">
                <span className="inline-flex max-w-[calc(100%-1rem)] flex-wrap items-baseline gap-x-3 gap-y-1 align-middle [overflow-wrap:anywhere]">
                  <span>{name}</span>
                  <span className="font-medium tabular-nums">{formatKopecks(group.total)}</span>
                </span>
              </summary>
              <ol aria-label={`Транзакції — ${name}`} className="divide-y divide-zinc-800 border-t border-zinc-800">
                {group.entries.map(({ transaction, amount }) => (
                  <li key={transaction.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2.5 pr-3 pl-6 text-sm [overflow-wrap:anywhere]">
                    <span className="min-w-0">
                      <span className="block font-medium">{getTransactionLabels(transaction, category).title}</span>
                      <time dateTime={transaction.date} className="mt-0.5 block text-xs text-zinc-400">{formatDate(transaction.date)}</time>
                    </span>
                    <span className="font-medium tabular-nums">{formatKopecks(amount)}</span>
                  </li>
                ))}
              </ol>
            </details>
          </li>
        )
      })}
    </ul>
  )
}
