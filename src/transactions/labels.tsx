import CategoryLabel from '../categories/CategoryLabel'
import type { Category } from '../categories/data'
import type { Transaction } from './data'

export function getTransactionLabels(transaction: Pick<Transaction, 'type' | 'purchase_name'>, category: Category | undefined) {
  const income = transaction.type === 'income'
  return {
    title: transaction.purchase_name?.trim() || (income ? 'Надходження' : 'Без назви'),
    categoryLabel: <CategoryLabel name={category?.name ?? 'Категорія'} color={category?.color} />,
    typeLabel: income ? 'Дохід' : 'Витрата',
  }
}
