import { formatDate } from '../lib/dates'
import { formatBalanceInput } from '../lib/money'
import type { Transaction } from '../transactions/data'

function escapeText(value: string) {
  // A spreadsheet should treat user-entered names and comments as text.
  const text = /^[=+@-]/.test(value.normalize('NFKC').trimStart()) ? `'${value}` : value
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const headers = ['Дата', 'Тип операції', 'Назва', 'Категорія', 'Рахунок', 'Сума', 'Валюта', 'Курс', 'Сума в гривнях', 'Коментар', 'ID операції']

export function createTransactionsCsv(transactions: readonly Transaction[],
  accounts: ReadonlyMap<string, { name: string }>, categories: ReadonlyMap<string, { name: string }>) {
  const lines = transactions.map((transaction) => {
    const expense = transaction.type === 'expense'
    const sign = expense ? -1n : 1n
    return [
      formatDate(transaction.date),
      expense ? 'Витрата' : 'Дохід',
      escapeText(transaction.purchase_name ?? ''),
      escapeText(categories.get(transaction.category_id)?.name ?? ''),
      escapeText(accounts.get(transaction.account_id)?.name ?? ''),
      formatBalanceInput(sign * BigInt(transaction.amount_original_kop)),
      transaction.currency,
      transaction.rate.replace('.', ','),
      formatBalanceInput(sign * BigInt(transaction.amount_uah_kop)),
      escapeText(transaction.comment ?? ''),
      transaction.id,
    ].join(';')
  })

  return '\uFEFF' + [headers.join(';'), ...lines].join('\r\n') + '\r\n'
}
