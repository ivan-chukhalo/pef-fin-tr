import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { loadAccountOverview, loadAccounts } from '../accounts/data'
import { loadCategories } from '../categories/data'
import { useLoadData } from '../lib/useLoadData'
import type { OfflinePageProps } from '../offline/snapshot'
import { loadLastUsdRate } from '../transactions/data'
import TransactionForm from '../transactions/TransactionForm'
import { loadRecurringTemplate, recurringPath, saveRecurringTemplate, type RecurringTemplateFields } from './data'

function RecurringEditor({ client, templateId, pendingTransactions }: OfflinePageProps & { templateId?: string }) {
  const navigate = useNavigate()
  const [draftId] = useState(() => templateId ?? crypto.randomUUID())
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const saving = useRef(false)
  const load = useCallback(async (signal: AbortSignal) => {
    const [accountData, categories, recurringTemplate, lastUsdRate] = await Promise.all([
      templateId
        ? loadAccounts(client, signal).then((accounts) => ({ accounts, changesByAccount: null }))
        : loadAccountOverview(client, signal, undefined, pendingTransactions),
      loadCategories(client, signal),
      templateId ? loadRecurringTemplate(client, templateId, signal) : null,
      loadLastUsdRate(client, signal, undefined, pendingTransactions),
    ])
    return { ...accountData, categories, recurringTemplate, lastUsdRate }
  }, [client, templateId, pendingTransactions])
  const { data, hasError, retry } = useLoadData(load)

  async function handleSave(fields: RecurringTemplateFields) {
    if (saving.current) return

    saving.current = true
    setIsSaving(true)
    setSaveError(false)
    try {
      await saveRecurringTemplate(client, draftId, fields, !templateId)
      navigate(recurringPath, { replace: true })
    } catch {
      setSaveError(true)
    } finally {
      saving.current = false
      setIsSaving(false)
    }
  }

  if (!data) {
    return hasError ? (
      <div className="mt-6 space-y-3">
        <p role="alert" className="text-sm text-rose-300">Не вдалося завантажити форму шаблону.</p>
        <button type="button" className="min-h-11 rounded-xl border border-zinc-700 px-3 text-sm hover:bg-zinc-800" onClick={retry}>
          Спробувати ще раз
        </button>
      </div>
    ) : <p role="status" className="mt-6 text-sm text-zinc-400">Завантажуємо форму…</p>
  }

  if (templateId && !data.recurringTemplate) {
    return (
      <div className="mt-6 space-y-3">
        <p role="alert">Шаблон не знайдено.</p>
        <Link to={recurringPath} className="text-emerald-200 underline underline-offset-2">До шаблонів</Link>
      </div>
    )
  }

  return (
    <>
      {templateId && <p className="mt-6 text-sm text-zinc-400">Зміни застосуються до запланованих операцій цього шаблону.</p>}
      <TransactionForm {...data} isSaving={isSaving} saveError={saveError} onSave={handleSave} />
    </>
  )
}

export default function RecurringEditorPage({ client, pendingTransactions }: OfflinePageProps) {
  const { templateId } = useParams()
  return <RecurringEditor key={templateId ?? 'new'} client={client} pendingTransactions={pendingTransactions} templateId={templateId} />
}
