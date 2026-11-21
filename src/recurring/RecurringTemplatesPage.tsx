import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate } from '../lib/dates'
import { formatKopecks } from '../lib/money'
import { useLoadData } from '../lib/useLoadData'
import { loadTransactionOptions } from '../transactions/data'
import { getTransactionLabels } from '../transactions/labels'
import { deleteRecurringTemplate, frequencyLabels, loadRecurringTemplates, recurringPath } from './data'

const buttonClass = 'inline-flex min-h-11 items-center rounded-xl border border-zinc-700 px-4 text-sm font-medium hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-50'
const primaryClass = 'inline-flex min-h-11 items-center rounded-xl bg-emerald-300 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300'
const usdFormatter = new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'USD' })

export default function RecurringTemplatesPage({ client }: { client: SupabaseClient }) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const deleting = useRef(false)
  const load = useCallback(async (signal: AbortSignal) => {
    const [options, templates] = await Promise.all([
      loadTransactionOptions(client, signal),
      loadRecurringTemplates(client, signal),
    ])
    templates.sort((first, second) => first.start_date.localeCompare(second.start_date))
    return { ...options, templates }
  }, [client])
  const { data, setData, hasError, retry } = useLoadData(load)

  async function handleDelete(id: string) {
    if (deleting.current) return

    deleting.current = true
    setIsDeleting(true)
    setDeleteError(false)
    try {
      await deleteRecurringTemplate(client, id)
      setData((current) => current && { ...current, templates: current.templates.filter((template) => template.id !== id) })
      setConfirmingId(null)
    } catch {
      setDeleteError(true)
    } finally {
      deleting.current = false
      setIsDeleting(false)
    }
  }

  function selectForDeletion(id: string | null) {
    setDeleteError(false)
    setConfirmingId(id)
  }

  if (!data) {
    return hasError ? (
      <div className="mt-6 space-y-3">
        <p role="alert" className="text-sm text-rose-300">Не вдалося завантажити шаблони.</p>
        <button type="button" className={buttonClass} onClick={retry}>Спробувати ще раз</button>
      </div>
    ) : <p role="status" className="mt-6 text-sm text-zinc-400">Завантажуємо шаблони…</p>
  }

  const accountNames = new Map(data.accounts.map(({ id, name }) => [id, name]))
  const categoryNames = new Map(data.categories.map(({ id, name }) => [id, name]))

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap gap-2">
        <Link to={`${recurringPath}/new`} className={primaryClass}>Додати шаблон</Link>
        <Link to="/transactions/planned" className={buttonClass}>До запланованих</Link>
      </div>
      {data.templates.length === 0 ? (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">Шаблонів ще немає.</p>
      ) : (
        <ul aria-label="Шаблони операцій" className="grid gap-3">
          {data.templates.map((template) => {
            const { title, categoryLabel } = getTransactionLabels(template, categoryNames.get(template.category_id) ?? 'Категорія')
            const income = template.type === 'income'
            const amount = BigInt(template.amount_original_kop) * (income ? 1n : -1n)

            return (
              <li key={template.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 [overflow-wrap:anywhere]">
                  <h2 className="font-semibold">{title}</h2>
                  <p className="font-semibold tabular-nums">{formatKopecks(amount, template.currency === 'USD' ? usdFormatter : undefined)}</p>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-zinc-400 [overflow-wrap:anywhere]">
                  {categoryLabel && <span>{categoryLabel}</span>}
                  {income && <span>Дохід</span>}
                  <span>{accountNames.get(template.account_id) ?? 'Рахунок'}</span>
                  <span>{frequencyLabels[template.frequency]}</span>
                  <span>Операцій у шаблоні: {template.occurrences}</span>
                  <span>Початок <time dateTime={template.start_date}>{formatDate(template.start_date)}</time></span>
                </div>
                {confirmingId === template.id ? (
                  <div className="mt-4 space-y-2 rounded-xl border border-rose-900/70 bg-rose-950/20 p-3">
                    <p className="text-sm text-rose-100">Видалити шаблон і всі його заплановані операції? Підтверджені операції залишаться в історії.</p>
                    {deleteError && <p role="alert" className="text-sm text-rose-300">Не вдалося видалити шаблон. Спробуйте ще раз.</p>}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={isDeleting} className="min-h-11 rounded-xl bg-rose-300 px-4 text-sm font-semibold text-zinc-950 hover:bg-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300 disabled:opacity-50" onClick={() => void handleDelete(template.id)}>
                        {isDeleting ? 'Видаляємо…' : 'Так, видалити'}
                      </button>
                      <button type="button" disabled={isDeleting} className={buttonClass} onClick={() => selectForDeletion(null)}>Скасувати</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link to={`${recurringPath}/${template.id}/edit`} className={buttonClass}>Редагувати</Link>
                    <button type="button" disabled={isDeleting} className={buttonClass} onClick={() => selectForDeletion(template.id)}>Видалити</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
