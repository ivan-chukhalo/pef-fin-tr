import CategoryLabel from '../categories/CategoryLabel'
import type { Category } from '../categories/data'
import type { Transaction } from './data'

export function getTransactionLabels(transaction: Pick<Transaction, 'type' | 'purchase_name'>, category: Category | undefined) {
  const categoryLabel = <CategoryLabel name={category?.name ?? 'Категорія'} color={category?.color} />
  const purchaseName = transaction.purchase_name?.trim()
  if (purchaseName) return { title: purchaseName, categoryLabel }

  return {
    title: <>{transaction.type === 'expense' && 'Витрата · '}{categoryLabel}</>,
    categoryLabel: null,
  }
}
