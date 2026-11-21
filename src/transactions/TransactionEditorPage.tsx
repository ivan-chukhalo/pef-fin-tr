import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { loadAccountOverview, loadAccounts } from '../accounts/data'
import { loadCategories } from '../categories/data'
import type { OperationStatus } from '../lib/operations'
import { useLoadData } from '../lib/useLoadData'
import { confirmTransaction, loadLastUsdRate, loadTransaction, saveTransaction, type TransactionFields } from './data'
import TransactionForm from './TransactionForm'

function TransactionEditor({ client, transactionId, initialStatus, confirming }: { client: SupabaseClient; transactionId?: string; initialStatus: OperationStatus; confirming: boolean }) {
  const navigate = useNavigate()
  const [draftId] = useState(() => transactionId ?? crypto.randomUUID())
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const saving = useRef(false)
  const load = useCallback(async (signal: AbortSignal) => {
    const [accountData, categories, transaction, lastUsdRate] = await Promise.all([
      transactionId
        ? loadAccounts(client, signal).then((accounts) => ({ accounts, changesByAccount: null }))
        : loadAccountOverview(client, signal),
      loadCategories(client, signal),
      transactionId ? loadTransaction(client, transactionId, signal, confirming ? 'planned' : 'all') : null,
      loadLastUsdRate(client, signal),
    ])
    return { ...accountData, categories, transaction, lastUsdRate }
  }, [client, transactionId, confirming])
  const { data, hasError, retry } = useLoadData(load)

  async function handleSave(fields: TransactionFields) {
    if (saving.current) return

    saving.current = true
    setIsSaving(true)
    setSaveError(false)
    try {
      let date = fields.date
      if (confirming) date = await confirmTransaction(client, draftId, fields)
      else await saveTransaction(client, draftId, fields, !transactionId)
      const destination = fields.status === 'planned' ? '/transactions/planned' : `/transactions?month=${date.slice(0, 7)}`
      navigate(destination, { replace: true })
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
        <p role="alert" className="text-sm text-rose-300">Не вдалося завантажити форму транзакції.</p>
        <button type="button" className="min-h-11 rounded-xl border border-zinc-700 px-3 text-sm hover:bg-zinc-800" onClick={retry}>
          Спробувати ще раз
        </button>
      </div>
    ) : <p role="status" className="mt-6 text-sm text-zinc-400">Завантажуємо форму…</p>
  }

  if (transactionId && !data.transaction) {
    return (
      <div className="mt-6 space-y-3">
        <p role="alert">Транзакцію не знайдено.</p>
        <Link to={confirming ? '/transactions/planned' : '/transactions'} className="text-emerald-200 underline underline-offset-2">{confirming ? 'До запланованих' : 'До списку транзакцій'}</Link>
      </div>
    )
  }

  const status = confirming ? 'confirmed' : data.transaction?.status ?? initialStatus
  return <TransactionForm {...data} initialStatus={status} confirming={confirming} isSaving={isSaving} saveError={saveError} onSave={handleSave} />
}

export default function TransactionEditorPage({ client, confirming = false }: { client: SupabaseClient; confirming?: boolean }) {
  const { transactionId } = useParams()
  const [params] = useSearchParams()
  const initialStatus = !transactionId && params.get('plan') === '1' ? 'planned' : 'confirmed'
  return <TransactionEditor key={confirming ? `confirm-${transactionId}` : transactionId ?? initialStatus} client={client} transactionId={transactionId} initialStatus={initialStatus} confirming={confirming} />
}
