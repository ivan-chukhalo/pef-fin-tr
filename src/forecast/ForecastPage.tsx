import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useState } from 'react'
import { getAccountBalance } from '../accounts/data'
import { formatDate, isDateOnOrBefore, nextCalendarDate, todayInKyiv } from '../lib/dates'
import { formatKopecks } from '../lib/money'
import { useLoadData } from '../lib/useLoadData'
import OperationList, { type TransactionActions } from '../transactions/OperationList'
import { getForecast, loadForecastData, type ForecastData } from './data'

function ForecastResults({ data, today, date, transactionActions }: {
  data: ForecastData
  today: string
  date: string
  transactionActions: TransactionActions
}) {
  const { changesByAccount, periodTransactions, periodTransfers, overdueTransactions, overdueTransfers } = getForecast(data, today, date)
  const activeAccounts = data.accounts.filter((account) => !account.is_hidden)

  return (
    <>
      <section aria-labelledby="forecast-balances">
        <h2 id="forecast-balances" className="mb-3 text-lg font-semibold">Баланси рахунків</h2>
        {activeAccounts.length ? (
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {activeAccounts.map((account) => {
              const balance = getAccountBalance(account, changesByAccount)
              return (
                <div key={account.id} className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
                  <dt className="text-sm text-zinc-300 [overflow-wrap:anywhere]">{account.name}</dt>
                  <dd className={`mt-1 text-xl font-semibold tabular-nums [overflow-wrap:anywhere] ${balance < 0n ? 'text-rose-300' : ''}`}>
                    {formatKopecks(balance)}
                  </dd>
                </div>
              )
            })}
          </dl>
        ) : <p className="text-sm text-zinc-400">Активних рахунків ще немає.</p>}
      </section>

      <section aria-labelledby="forecast-period">
        <h2 id="forecast-period" className="text-lg font-semibold">Операції за період</h2>
        <p className="mb-3 mt-1 text-sm text-zinc-400">
          <time dateTime={today}>{formatDate(today)}</time> – <time dateTime={date}>{formatDate(date)}</time>
        </p>
        <OperationList
          accounts={data.accounts}
          categories={data.categories}
          transactions={periodTransactions}
          transfers={periodTransfers}
          today={today}
          label="Операції за період"
          emptyMessage="За цей період операцій немає."
          showStatus
          transactionActions={transactionActions}
          headingTag="h3"
        />
      </section>

      {Boolean(overdueTransactions.length || overdueTransfers.length) && (
        <section aria-labelledby="forecast-overdue">
          <h2 id="forecast-overdue" className="mb-3 text-lg font-semibold">Прострочені, враховані у прогнозі</h2>
          <OperationList
            accounts={data.accounts}
            categories={data.categories}
            transactions={overdueTransactions}
            transfers={overdueTransfers}
            today={today}
            label="Прострочені операції"
            emptyMessage="Прострочених операцій немає."
            transactionActions={transactionActions}
            headingTag="h3"
          />
        </section>
      )}
    </>
  )
}

export default function ForecastPage({ client }: { client: SupabaseClient }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const load = useCallback((signal: AbortSignal) => loadForecastData(client, signal), [client])
  const { data, setData, hasError, retry } = useLoadData(load)
  const onTransactionChange: TransactionActions['onChange'] = (id, replacement) => {
    setData((current) => current && {
      ...current,
      transactions: current.transactions.flatMap((transaction) =>
        transaction.id !== id ? [transaction] : replacement ? [replacement] : [],
      ),
    })
  }

  if (!data) {
    return hasError ? (
      <div className="mt-6 space-y-3">
        <p role="alert" className="text-sm text-rose-300">Не вдалося завантажити дані для прогнозу.</p>
        <button type="button" onClick={retry} className="min-h-11 rounded-xl border border-zinc-700 px-3 text-sm hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
          Спробувати ще раз
        </button>
      </div>
    ) : <p role="status" className="mt-6 text-sm text-zinc-400">Завантажуємо дані для прогнозу…</p>
  }

  const today = todayInKyiv()
  const tomorrow = nextCalendarDate(today)
  const date = selectedDate ?? tomorrow

  return (
    <div className="mt-6 space-y-6 sm:space-y-8">
      <div className="grid w-full max-w-64 gap-2 text-sm font-medium">
        <label htmlFor="forecast-date">Дата прогнозу</label>
        <input id="forecast-date" type="date" min={tomorrow} value={date} onChange={(event) => setSelectedDate(event.target.value)} className="min-h-11 min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30" />
      </div>
      {isDateOnOrBefore(date) && date >= tomorrow ? (
        <ForecastResults data={data} today={today} date={date} transactionActions={{ client, onChange: onTransactionChange }} />
      ) : (
        <p role="status" className="text-sm text-zinc-400">Оберіть майбутню дату.</p>
      )}
    </div>
  )
}
