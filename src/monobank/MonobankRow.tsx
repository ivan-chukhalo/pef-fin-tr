import { useId, useState } from 'react'
import type { Account } from '../accounts/data'
import { categoryColorStyle } from '../categories/color'
import { getAvailableCategories, type Category } from '../categories/data'
import SubcategorySelect from '../categories/SubcategorySelect'
import { defaultSubcategoryId, type Subcategory } from '../categories/subcategories'
import { formatDate, todayInKyiv } from '../lib/dates'
import { formatKopecks } from '../lib/money'
import type { Transfer } from '../transfers/data'
import type { Transaction } from '../transactions/data'
import { getTransactionLabels } from '../transactions/labels'
import { absoluteKopecks, findMonobankMatches, getMonobankAmounts, type MonobankImport } from './data'
import type { MonobankEntry } from './types'

export const monobankFieldClass = 'w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30 disabled:opacity-60'
export const monobankButtonClass = 'min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-medium hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60'

export default function MonobankRow({
  entry, accountId, accounts, categories, subcategories, transactions, transfers, busy, saving, onSave, onSkip,
}: {
  entry: MonobankEntry
  accountId: string
  accounts: Account[]
  categories: Category[]
  subcategories: Subcategory[]
  transactions: Transaction[]
  transfers: Transfer[]
  busy: boolean
  saving: boolean
  onSave: (operation: MonobankImport) => void
  onSkip: () => void
}) {
  const [transfer, setTransfer] = useState(false)
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState(defaultSubcategoryId)
  const subcategoryFieldId = useId()
  const [otherAccountId, setOtherAccountId] = useState('')
  const [transactionName, setTransactionName] = useState(entry.description)
  const amount = BigInt(entry.amountKop)
  const type = amount > 0n ? 'income' : 'expense'
  const date = todayInKyiv(new Date(entry.time * 1000))
  const categoryOptions = getAvailableCategories(categories, type)
  const otherAccounts = accounts.filter(({ id, is_hidden }) => id !== accountId && !is_hidden)
  const validSelection = transfer ? otherAccounts.some(({ id }) => id === otherAccountId) : categoryOptions.some(({ id }) => id === categoryId)
  const matches = findMonobankMatches(entry, accountId, date, transactions, transfers)
  const hasMatches = matches.transactions.length > 0 || matches.transfers.length > 0

  function save() {
    if (!validSelection) return

    const description = entry.description.trim() || null
    if (transfer) {
      onSave({
        kind: 'transfer',
        fields: {
          from_account_id: amount > 0n ? otherAccountId : accountId,
          to_account_id: amount > 0n ? accountId : otherAccountId,
          date,
          status: 'confirmed',
          amount_uah_kop: absoluteKopecks(entry.amountKop).toString(),
          comment: description,
        },
      })
    } else {
      const name = transactionName.trim() || null
      onSave({
        kind: 'transaction',
        fields: {
          account_id: accountId,
          category_id: categoryId,
          subcategory_id: subcategoryId,
          type,
          date,
          status: 'confirmed',
          ...getMonobankAmounts(entry),
          purchase_name: name,
          comment: name === description ? null : description,
        },
      })
    }
  }

  return (
    <li className="min-w-0 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 [overflow-wrap:anywhere]">
        <div className="min-w-0">
          <h2 className="font-semibold">{entry.description || 'Операція monobank'}</h2>
          <p className="mt-1 text-sm text-zinc-400">
            <time dateTime={date}>{formatDate(date)}</time>
            {entry.mcc > 0 && ` · MCC ${entry.mcc}`}
          </p>
        </div>
        <p className="font-semibold tabular-nums">{formatKopecks(amount)}</p>
      </div>
      {hasMatches && (
        <div className="space-y-1 rounded-xl border border-amber-900/70 bg-amber-950/20 p-3 text-sm text-amber-100">
          <p>Можливий збіг з обліком за рахунком, датою та сумою.</p>
          <ul className="list-inside list-disc [overflow-wrap:anywhere]">
            {matches.transactions.map((row) => {
              const { title, categoryLabel } = getTransactionLabels(row, categories.find(({ id }) => id === row.category_id))
              return <li key={row.id}>{title} <span className="ms-1">{categoryLabel}</span></li>
            })}
            {matches.transfers.map((row) => (
              <li key={row.id}>{accounts.find(({ id }) => id === row.from_account_id)?.name} → {accounts.find(({ id }) => id === row.to_account_id)?.name}</li>
            ))}
          </ul>
        </div>
      )}
      <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-2">
        {!transfer && (
          <label className="grid min-w-0 gap-2 text-sm font-medium sm:col-span-2">
            {type === 'income' ? 'Назва доходу' : 'Назва покупки'}
            <input className={monobankFieldClass} value={transactionName} onChange={(event) => setTransactionName(event.target.value)} />
          </label>
        )}
        <label className="grid min-w-0 gap-2 text-sm font-medium">
          Тип операції
          <select className={monobankFieldClass} value={transfer ? 'transfer' : type} onChange={(event) => setTransfer(event.target.value === 'transfer')}>
            <option value={type}>{type === 'income' ? 'Дохід' : 'Витрата'}</option>
            <option value="transfer" disabled={otherAccounts.length === 0}>Переказ між своїми рахунками</option>
          </select>
        </label>
        {transfer ? (
          <label className="grid min-w-0 gap-2 text-sm font-medium">
            {amount > 0n ? 'З рахунку' : 'На рахунок'}
            <select className={monobankFieldClass} value={otherAccountId} onChange={(event) => setOtherAccountId(event.target.value)}>
              <option value="" disabled>Вибери рахунок</option>
              {otherAccounts.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        ) : (
          <label className="grid min-w-0 gap-2 text-sm font-medium">
            {type === 'income' ? 'Категорія доходу' : 'Категорія витрати'}
            <select className={monobankFieldClass} style={categoryColorStyle(categoryOptions.find(({ id }) => id === categoryId)?.color)} value={categoryId} onChange={(event) => {
              setCategoryId(event.target.value)
              setSubcategoryId(defaultSubcategoryId)
            }}>
              <option value="" disabled>Вибери категорію</option>
              {categoryOptions.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        )}
        {!transfer && categoryId && (
          <label className="grid min-w-0 gap-2 text-sm font-medium">
            Підкатегорія
            <SubcategorySelect id={subcategoryFieldId} className={monobankFieldClass} categoryId={categoryId}
              subcategories={subcategories} value={subcategoryId} onChange={setSubcategoryId} />
          </label>
        )}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={monobankButtonClass} disabled={busy || !validSelection} onClick={save}>
          {saving ? 'Зберігаємо…' : hasMatches ? 'Додати окремо' : 'Зберегти операцію'}
        </button>
        <button type="button" className={monobankButtonClass} disabled={busy} onClick={onSkip}>
          {hasMatches ? 'Вже враховано' : 'Пропустити'}
        </button>
      </div>
    </li>
  )
}
