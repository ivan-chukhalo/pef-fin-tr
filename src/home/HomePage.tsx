import type { OfflinePageProps } from '../offline/snapshot'
import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getAccountBalance, getAccountBalanceChanges, loadTransferAmounts } from '../accounts/data'
import { formatDate, formatMonth, todayInKyiv } from '../lib/dates'
import { formatKopecks } from '../lib/money'
import { useLoadData } from '../lib/useLoadData'
import { loadTransactionHistory } from '../transactions/data'
import { getTransactionLabels } from '../transactions/labels'

const cardClass = 'min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900'
const linkClass = 'inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-emerald-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300'

export default function HomePage({ client, snapshot, transactionOverlay }: OfflinePageProps) {
  const load = useCallback(async (signal: AbortSignal) => {
    const [history, transfers] = await Promise.all([
      loadTransactionHistory(client, signal, snapshot, transactionOverlay),
      loadTransferAmounts(client, signal, snapshot),
    ])
    return { ...history, changesByAccount: getAccountBalanceChanges(history.transactions, transfers) }
  }, [client, snapshot, transactionOverlay])
  const { data, hasError, retry } = useLoadData(load)

  if (!data) {
    return hasError ? (
      <div className="mt-6 space-y-3">
        <p role="alert" className="text-sm text-rose-300">Не вдалося завантажити головну сторінку.</p>
        <button type="button" onClick={retry} className="min-h-11 rounded-xl border border-zinc-700 px-3 text-sm hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
          Спробувати ще раз
        </button>
      </div>
    ) : <p role="status" className="mt-6 text-sm text-zinc-400">Завантажуємо головну сторінку…</p>
  }

  const month = todayInKyiv().slice(0, 7)
  const totals = { income: 0n, expense: 0n }
  for (const transaction of data.transactions) {
    if (transaction.date.startsWith(`${month}-`)) totals[transaction.type] += BigInt(transaction.amount_uah_kop)
  }

  const activeAccounts = data.accounts.filter((account) => !account.is_hidden)
  const accountsById = new Map(data.accounts.map((account) => [account.id, account.name]))
  const categoriesById = new Map(data.categories.map((category) => [category.id, category]))
  const recentTransactions = data.transactions.slice(0, 5)

  return (
    <div className="mt-6 space-y-6 sm:space-y-8">
      <section aria-labelledby="home-month">
        <h2 id="home-month" className="mb-3 text-lg font-semibold first-letter:uppercase">
          <time dateTime={month}>{formatMonth(month)}</time>
        </h2>
        <dl className="grid grid-cols-2 gap-3">
          <div className={`${cardClass} p-3 sm:p-5`}>
            <dt className="text-sm text-zinc-400">Доходи</dt>
            <dd className="mt-1 text-lg font-semibold text-emerald-200 tabular-nums [overflow-wrap:anywhere] sm:text-2xl">{formatKopecks(totals.income)}</dd>
          </div>
          <div className={`${cardClass} p-3 sm:p-5`}>
            <dt className="text-sm text-zinc-400">Витрати</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums [overflow-wrap:anywhere] sm:text-2xl">{formatKopecks(totals.expense)}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="home-accounts">
        <header className="mb-2 flex flex-wrap items-center justify-between gap-x-4">
          <h2 id="home-accounts" className="text-lg font-semibold">Баланси рахунків</h2>
          <Link to="/more/accounts" className={linkClass}>Усі рахунки</Link>
        </header>
        {activeAccounts.length ? (
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {activeAccounts.map((account) => {
              const balance = getAccountBalance(account, data.changesByAccount)
              return (
                <div key={account.id} className={`${cardClass} p-4 sm:p-5`}>
                  <dt className="text-sm text-zinc-300 [overflow-wrap:anywhere]">{account.name}</dt>
                  <dd className={`mt-1 text-xl font-semibold tabular-nums [overflow-wrap:anywhere] ${balance < 0n ? 'text-rose-300' : ''}`}>
                    {formatKopecks(balance)}
                  </dd>
                </div>
              )
            })}
          </dl>
        ) : <p className={`${cardClass} p-4 text-sm text-zinc-400 sm:p-5`}>Активних рахунків ще немає.</p>}
      </section>

      <section aria-labelledby="home-recent">
        <header className="mb-2 flex flex-wrap items-center justify-between gap-x-4">
          <h2 id="home-recent" className="text-lg font-semibold">Останні транзакції</h2>
          <Link to="/transactions?month=" className={linkClass}>Усі транзакції</Link>
        </header>
        {recentTransactions.length ? (
          <ol aria-labelledby="home-recent" className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900">
            {recentTransactions.map((transaction) => {
              const income = transaction.type === 'income'
              const amount = BigInt(transaction.amount_uah_kop)
              const { title, categoryLabel, typeLabel, syncLabel } = getTransactionLabels(transaction, categoriesById.get(transaction.category_id))
              return (
                <li key={transaction.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-start gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium [overflow-wrap:anywhere]">{title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400 [overflow-wrap:anywhere]">
                      {categoryLabel}
                      <span>{typeLabel}</span>
                      {syncLabel}
                      <span>{accountsById.get(transaction.account_id) ?? 'Рахунок'}</span>
                      <time dateTime={transaction.date}>{formatDate(transaction.date)}</time>
                    </div>
                  </div>
                  <p className={`min-w-0 text-right text-sm font-semibold tabular-nums [overflow-wrap:anywhere] ${income ? 'text-emerald-200' : ''}`}>
                    {formatKopecks(income ? amount : -amount)}
                  </p>
                </li>
              )
            })}
          </ol>
        ) : <p className={`${cardClass} p-4 text-sm text-zinc-400 sm:p-5`}>Транзакцій ще немає.</p>}
      </section>
    </div>
  )
}
