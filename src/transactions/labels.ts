import type { Transaction } from './data'

export function getTransactionLabels(transaction: Pick<Transaction, 'type' | 'purchase_name'>, categoryName: string) {
  const purchaseName = transaction.purchase_name?.trim()
  if (purchaseName) return { title: purchaseName, categoryLabel: categoryName }

  const title = transaction.type === 'expense' ? `Витрата · ${categoryName}` : categoryName
  return { title, categoryLabel: null }
}
