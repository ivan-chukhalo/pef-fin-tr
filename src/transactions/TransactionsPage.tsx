import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { formatDate, formatMonth, todayInKyiv } from '../lib/dates'
import { formatKopecks } from '../lib/money'
import { useLoadData } from '../lib/useLoadData'
import { deleteTransaction, loadTransactionHistory, type Transaction } from './data'
import { getTransactionLabels } from './labels'

const selectClass = 'w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30'
const buttonClass = 'inline-flex min-h-11 items-center rounded-xl border border-zinc-700 px-3 text-sm font-medium text-zinc-100 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-50'
const usdFormatter = new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'USD' })

function TransactionRow({ transaction, accountName, categoryName, confirming, isDeleting, onConfirm, onCancel, onDelete }: {
  transaction: Transaction
  accountName: string
  categoryName: string
  confirming: boolean
  isDeleting: boolean
  onConfirm: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  const income = transaction.type === 'income'
  const amountUah = BigInt(transaction.amount_uah_kop)
  const { title, categoryLabel } = getTransactionLabels(transaction, categoryName)

  return (
    <li className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
      <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,auto)]">
        <div className="min-w-0">
          <h2 className="text-base font-semibold [overflow-wrap:anywhere]">{title}</h2>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-zinc-400 [overflow-wrap:anywhere]">
            {categoryLabel && <span>{categoryLabel}</span>}
            {(income || categoryLabel) && <span>{income ? 'Дохід' : 'Витрата'}</span>}
            <span>{accountName}</span>
            <time dateTime={transaction.date}>{formatDate(transaction.date)}</time>
          </div>
          {transaction.comment && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300 [overflow-wrap:anywhere]">{transaction.comment}</p>}
        </div>
        <div className="min-w-0 sm:text-right">
          <p className={`text-lg font-semibold tabular-nums [overflow-wrap:anywhere] ${income ? 'text-emerald-200' : 'text-zinc-100'}`}>
            {formatKopecks(income ? amountUah : -amountUah)}
          </p>
          {transaction.currency === 'USD' && (
            <p className="mt-1 text-sm text-zinc-400 [overflow-wrap:anywhere]">
              {formatKopecks(BigInt(transaction.amount_original_kop), usdFormatter)}
            </p>
          )}
        </div>
      </div>

      {confirming ? (
        <div className="mt-4 space-y-2 rounded-xl border border-rose-900/70 bg-rose-950/20 p-3">
          <p className="text-sm text-rose-100">Видалити цю транзакцію?</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={isDeleting} className="min-h-11 rounded-xl bg-rose-300 px-3 text-sm font-semibold text-zinc-950 hover:bg-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300 disabled:opacity-50" onClick={onDelete}>
              {isDeleting ? 'Видаляємо…' : 'Так, видалити'}
            </button>
            <button type="button" disabled={isDeleting} className={buttonClass} onClick={onCancel}>Скасувати</button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={`/transactions/${transaction.id}/edit`} className={buttonClass}>Редагувати</Link>
          <button type="button" disabled={isDeleting} className={buttonClass} onClick={onConfirm}>Видалити</button>
        </div>
      )}
    </li>
  )
}

export default function TransactionsPage({ client }: { client: SupabaseClient }) {
  const [params, setParams] = useSearchParams()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const deleting = useRef(false)
  const load = useCallback((signal: AbortSignal) => loadTransactionHistory(client, signal), [client])
  const { data, setData, hasError, retry } = useLoadData(load)

  const currentMonth = todayInKyiv().slice(0, 7)
  const requestedMonth = params.get('month')
  const month = requestedMonth === '' || (requestedMonth && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(requestedMonth))
    ? requestedMonth
    : currentMonth
  const accountId = params.get('account') ?? ''
  const categoryId = params.get('category') ?? ''

  function changeFilter(key: 'month' | 'account' | 'category', value: string) {
    const next = new URLSearchParams(params)
    if (value || key === 'month') next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setConfirmingId(null)
    setDeleteError(false)
  }

  async function handleDelete(id: string) {
    if (deleting.current) return

    deleting.current = true
    setIsDeleting(true)
    setDeleteError(false)
    try {
      await deleteTransaction(client, id)
      setData((current) => current && {
        ...current,
        transactions: current.transactions.filter((transaction) => transaction.id !== id),
      })
      setConfirmingId(null)
    } catch {
      setDeleteError(true)
    } finally {
      deleting.current = false
      setIsDeleting(false)
    }
  }

  if (!data) {
    return hasError ? (
      <div className="mt-6 space-y-3">
        <p role="alert" className="text-sm text-rose-300">Не вдалося завантажити транзакції.</p>
        <button type="button" className={buttonClass} onClick={retry}>Спробувати ще раз</button>
      </div>
    ) : <p role="status" className="mt-6 text-sm text-zinc-400">Завантажуємо транзакції…</p>
  }

  const months = [...new Set([currentMonth, ...data.transactions.map((transaction) => transaction.date.slice(0, 7)), ...(month ? [month] : [])])]
    .sort((first, second) => second.localeCompare(first))
  const accounts = new Map(data.accounts.map((account) => [account.id, account]))
  const categories = new Map(data.categories.map((category) => [category.id, category]))
  const filtered = data.transactions.filter((transaction) =>
    (!month || transaction.date.startsWith(`${month}-`)) &&
    (!accountId || transaction.account_id === accountId) &&
    (!categoryId || transaction.category_id === categoryId),
  )

  return (
    <div className="mt-6 space-y-5">
      <fieldset className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:grid-cols-3" disabled={isDeleting}>
        <div className="grid min-w-0 gap-2 text-sm font-medium">
          <label htmlFor="transaction-filter-month">Місяць</label>
          <select id="transaction-filter-month" className={selectClass} value={month} onChange={(event) => changeFilter('month', event.target.value)}>
            <option value="">Усі місяці</option>
            {months.map((value) => <option key={value} value={value}>{formatMonth(value)}</option>)}
          </select>
        </div>
        <div className="grid min-w-0 gap-2 text-sm font-medium">
          <label htmlFor="transaction-filter-account">Рахунок</label>
          <select id="transaction-filter-account" className={selectClass} value={accountId} onChange={(event) => changeFilter('account', event.target.value)}>
            <option value="">Усі рахунки</option>
            {data.accounts.map(({ id, name, is_hidden }) => <option key={id} value={id}>{name}{is_hidden ? ' (приховано)' : ''}</option>)}
          </select>
        </div>
        <div className="grid min-w-0 gap-2 text-sm font-medium">
          <label htmlFor="transaction-filter-category">Категорія</label>
          <select id="transaction-filter-category" className={selectClass} value={categoryId} onChange={(event) => changeFilter('category', event.target.value)}>
            <option value="">Усі категорії</option>
            <optgroup label="Витрати">
              {data.categories.filter(({ type }) => type === 'expense').map(({ id, name, is_hidden }) => <option key={id} value={id}>{name}{is_hidden ? ' (приховано)' : ''}</option>)}
            </optgroup>
            <optgroup label="Доходи">
              {data.categories.filter(({ type }) => type === 'income').map(({ id, name, is_hidden }) => <option key={id} value={id}>{name}{is_hidden ? ' (приховано)' : ''}</option>)}
            </optgroup>
          </select>
        </div>
      </fieldset>

      {deleteError && <p role="alert" className="text-sm text-rose-300">Не вдалося видалити транзакцію. Спробуйте ще раз.</p>}
      {filtered.length ? (
        <ul aria-label="Список транзакцій" className="grid gap-3">
          {filtered.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              accountName={accounts.get(transaction.account_id)?.name ?? 'Рахунок'}
              categoryName={categories.get(transaction.category_id)?.name ?? 'Категорія'}
              confirming={confirmingId === transaction.id}
              isDeleting={isDeleting}
              onConfirm={() => {
                setConfirmingId(transaction.id)
                setDeleteError(false)
              }}
              onCancel={() => {
                setConfirmingId(null)
                setDeleteError(false)
              }}
              onDelete={() => void handleDelete(transaction.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
          {data.transactions.length ? 'За вибраними фільтрами транзакцій немає.' : 'Транзакцій ще немає.'}
        </p>
      )}
    </div>
  )
}
