import { Link } from 'react-router-dom'
import type { Account } from '../accounts/data'
import type { Category } from '../categories/data'
import { formatDate } from '../lib/dates'
import { formatKopecks } from '../lib/money'
import type { Transfer } from '../transfers/data'
import type { Transaction } from './data'
import { getTransactionLabels } from './labels'

type OperationListProps = {
  transactions: readonly Transaction[]
  transfers: readonly Transfer[]
  accounts: readonly Account[]
  categories: readonly Category[]
  today: string
  label: string
  emptyMessage: string
  showStatus?: boolean
  showTransactionActions?: boolean
  headingTag?: 'h2' | 'h3'
}

const actionClass = 'inline-flex min-h-11 items-center rounded-xl border border-zinc-700 px-3 text-sm font-medium hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300'

export default function OperationList({ transactions, transfers, accounts, categories, today, label, emptyMessage, showStatus = false, showTransactionActions = false, headingTag: Heading = 'h2' }: OperationListProps) {
  const accountNames = new Map(accounts.map(({ id, name }) => [id, name]))
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const accountName = (id: string) => accountNames.get(id) ?? 'Рахунок'
  const operations = [
    ...transactions.map((transaction) => {
      const { title, categoryLabel } = getTransactionLabels(transaction, categoriesById.get(transaction.category_id))
      const income = transaction.type === 'income'
      return {
        key: `transaction-${transaction.id}`,
        date: transaction.date,
        status: transaction.status,
        title,
        categoryLabel,
        details: income ? `Дохід · ${accountName(transaction.account_id)}` : accountName(transaction.account_id),
        amount: BigInt(transaction.amount_uah_kop) * (income ? 1n : -1n),
        comment: transaction.comment,
        transactionPath: showTransactionActions && transaction.status === 'planned' ? `/transactions/${transaction.id}` : null,
      }
    }),
    ...transfers.map((transfer) => ({
      key: `transfer-${transfer.id}`,
      date: transfer.date,
      status: transfer.status,
      title: 'Переказ',
      categoryLabel: null,
      details: `${accountName(transfer.from_account_id)} → ${accountName(transfer.to_account_id)}`,
      amount: BigInt(transfer.amount_uah_kop),
      comment: transfer.comment,
      transactionPath: null,
    })),
  ].sort((first, second) => first.date.localeCompare(second.date) || first.key.localeCompare(second.key))

  if (!operations.length) return <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">{emptyMessage}</p>

  return (
    <ol aria-label={label} className="grid gap-3">
      {operations.map(({ key, date, status, title, categoryLabel, details, amount, comment, transactionPath }) => (
        <li key={key} className="grid min-w-0 gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,auto)] sm:p-5">
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <Heading className="font-semibold">{title}</Heading>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-400">
              {categoryLabel}
              <span>{details}</span>
              <time dateTime={date}>{formatDate(date)}</time>
              {status === 'planned' && date <= today ? <span className="text-amber-200">Прострочено</span> : (
                showStatus && <span>{status === 'planned' ? 'Заплановано' : 'Підтверджено'}</span>
              )}
            </div>
            {comment && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{comment}</p>}
          </div>
          <p className="min-w-0 font-semibold tabular-nums [overflow-wrap:anywhere] sm:text-right">{formatKopecks(amount)}</p>
          {transactionPath && (
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Link to={`${transactionPath}/edit`} className={actionClass}>Редагувати</Link>
              <Link to={`${transactionPath}/confirm`} className={actionClass}>Підтвердити</Link>
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}
