import { useState } from 'react'
import type { Account } from '../accounts/data'
import type { Category } from '../categories/data'
import { getSubcategoryName, type Subcategory } from '../categories/subcategories'
import { formatDate } from '../lib/dates'
import { formatKopecks } from '../lib/money'
import { canApplyTransactionChange, isRejectedConfirmation, type QueuedChange } from '../offline/snapshot'
import type { Transaction } from './data'
import { getTransactionLabels } from './labels'

const actionClass = 'min-h-11 rounded-xl border border-zinc-700 px-3 text-sm font-medium hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:opacity-50'
const usdFormatter = new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'USD' })

function TransactionVersion({ title, transaction, accounts, categories, subcategories }: {
  title: string
  transaction: Transaction | null
  accounts: ReadonlyMap<string, Account>
  categories: ReadonlyMap<string, Category>
  subcategories: ReadonlyMap<string, Subcategory>
}) {
  const labels = transaction ? getTransactionLabels(transaction, categories.get(transaction.category_id)) : null
  return (
    <div className="min-w-0 space-y-1 rounded-xl border border-zinc-700 p-3 [overflow-wrap:anywhere]">
      <h4 className="text-sm font-medium text-zinc-300">{title}</h4>
      {transaction && labels ? (
        <>
          <p className="font-semibold">{labels.title} · {formatKopecks(BigInt(transaction.amount_uah_kop))}</p>
          {transaction.currency === 'USD' && (
            <p className="text-sm text-zinc-300">{formatKopecks(BigInt(transaction.amount_original_kop), usdFormatter)} · курс {transaction.rate.replace('.', ',')}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-400">
            {labels.categoryLabel}
            <span>{getSubcategoryName(transaction.subcategory_id, subcategories)}</span>
            <span>{labels.typeLabel}</span>
            <span>{transaction.status === 'planned' ? 'Заплановано' : 'Підтверджено'}</span>
            <span>{accounts.get(transaction.account_id)?.name ?? 'Рахунок недоступний'}</span>
            <time dateTime={transaction.date}>{formatDate(transaction.date)}</time>
          </div>
          {transaction.comment && <p className="whitespace-pre-wrap text-sm text-zinc-300">{transaction.comment}</p>}
        </>
      ) : <p className="text-sm text-zinc-300">Транзакцію видалено.</p>}
    </div>
  )
}

export default function TransactionConflicts({ changes, accounts, categories, subcategories, onResolve }: {
  changes: readonly QueuedChange[]
  accounts: ReadonlyMap<string, Account>
  categories: ReadonlyMap<string, Category>
  subcategories: ReadonlyMap<string, Subcategory>
  onResolve: (operationId: string, keepLocal: boolean) => Promise<void>
}) {
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState(false)
  const deletions = changes.filter(({ next, conflict }) => !next && !conflict)
  const failedDeletions = deletions.filter(({ delivery }) => delivery === 'failed').length
  const pendingDeletions = deletions.length - failedDeletions
  const conflicts = changes.filter(({ conflict }) => conflict)
  const rejectedConfirmations = changes.filter(isRejectedConfirmation)
  if (!deletions.length && !conflicts.length && !rejectedConfirmations.length) return null

  async function choose(operationId: string, keepLocal: boolean) {
    if (resolving) return
    setResolving(true)
    setError(false)
    try {
      await onResolve(operationId, keepLocal)
    } catch {
      setError(true)
    } finally {
      setResolving(false)
    }
  }

  return (
    <section className="space-y-3">
      {!!pendingDeletions && <p role="status" className="text-sm text-zinc-300">Видалення в черзі синхронізації · {pendingDeletions}</p>}
      {!!failedDeletions && <p role="status" className="text-sm text-amber-200">Видалення не синхронізовано · {failedDeletions}</p>}
      {rejectedConfirmations.map(({ operationId, next }) => (
        <article key={operationId} className="space-y-3 rounded-2xl border border-amber-300/30 bg-zinc-900 p-4">
          <p className="text-sm text-amber-200">Сервер відхилив підтвердження. Поверни операцію до запланованих, щоб підтвердити її з коректними даними.</p>
          <TransactionVersion title="Моє підтвердження" transaction={next}
            accounts={accounts} categories={categories} subcategories={subcategories} />
          <button type="button" className={actionClass} disabled={resolving} onClick={() => void choose(operationId, false)}>Повернути до запланованих</button>
        </article>
      ))}
      {conflicts.map(({ operationId, original, next, conflict }) => (
        <article key={operationId} className="space-y-3 rounded-2xl border border-amber-300/30 bg-zinc-900 p-4">
          <h3 className="font-semibold">Порівняй версії · {getTransactionLabels(original, undefined).title}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <TransactionVersion title="Моя зміна" transaction={next}
              accounts={accounts} categories={categories} subcategories={subcategories} />
            <TransactionVersion title="Збережено в Supabase" transaction={conflict?.remote ?? null}
              accounts={accounts} categories={categories} subcategories={subcategories} />
          </div>
          <div className="flex flex-wrap gap-2">
            {canApplyTransactionChange({ original, next }, conflict?.remote) && (
              <button type="button" className={actionClass} disabled={resolving} onClick={() => void choose(operationId, true)}>{next ? 'Застосувати мою версію' : 'Підтвердити видалення'}</button>
            )}
            <button type="button" className={actionClass} disabled={resolving} onClick={() => void choose(operationId, false)}>Залишити збережену версію</button>
          </div>
        </article>
      ))}
      {error && <p role="alert" className="text-sm text-rose-300">Не вдалося зберегти вибір. Спробуй ще раз.</p>}
    </section>
  )
}
