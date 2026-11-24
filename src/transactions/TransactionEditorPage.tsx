import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { loadAccountOverview, loadAccounts } from '../accounts/data'
import { loadCategories } from '../categories/data'
import type { OperationStatus } from '../lib/operations'
import { canReachSupabase } from '../lib/supabase'
import { useLoadData } from '../lib/useLoadData'
import type { OfflinePageProps } from '../offline/snapshot'
import { confirmTransaction, loadLastUsdRate, loadTransaction, saveTransaction, type TransactionFields } from './data'
import TransactionForm from './TransactionForm'

type QueueTransaction = (id: string, fields: TransactionFields) => Promise<void>

function TransactionEditor({ client, snapshot, pendingTransactions, queueTransaction, transactionId, initialStatus, confirming }: OfflinePageProps & { queueTransaction?: QueueTransaction; transactionId?: string; initialStatus: OperationStatus; confirming: boolean }) {
  const navigate = useNavigate()
  const [draftId] = useState(() => transactionId ?? crypto.randomUUID())
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const saving = useRef(false)
  const load = useCallback(async (signal: AbortSignal) => {
    const [accountData, categories, transaction, lastUsdRate] = await Promise.all([
      transactionId
        ? loadAccounts(client, signal).then((accounts) => ({ accounts, changesByAccount: null }))
        : loadAccountOverview(client, signal, snapshot, pendingTransactions),
      loadCategories(client, signal, snapshot),
      transactionId ? loadTransaction(client, transactionId, signal, confirming ? 'planned' : 'all') : null,
      loadLastUsdRate(client, signal, snapshot, pendingTransactions),
    ])
    return { ...accountData, categories, transaction, lastUsdRate }
  }, [client, transactionId, confirming, snapshot, pendingTransactions])
  const { data, hasError, retry } = useLoadData(load)

  async function handleSave(fields: TransactionFields) {
    if (saving.current) return

    saving.current = true
    setIsSaving(true)
    setSaveError(false)
    try {
      let date = fields.date
      if (confirming) date = await confirmTransaction(client, draftId, fields)
      else if (!transactionId && fields.status === 'confirmed' && queueTransaction) {
        if (snapshot || !navigator.onLine || !canReachSupabase()) await queueTransaction(draftId, fields)
        else {
          try {
            await saveTransaction(client, draftId, fields, true)
          } catch (error) {
            if (navigator.onLine && canReachSupabase()) throw error
            await queueTransaction(draftId, fields)
          }
        }
      } else await saveTransaction(client, draftId, fields, !transactionId)
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
  return <TransactionForm {...data} initialStatus={status} confirming={confirming} offline={!!snapshot} isSaving={isSaving} saveError={saveError} onSave={handleSave} />
}

export default function TransactionEditorPage({ confirming = false, ...props }: OfflinePageProps & { confirming?: boolean; queueTransaction?: QueueTransaction }) {
  const { transactionId } = useParams()
  const [params] = useSearchParams()
  const initialStatus = !transactionId && params.get('plan') === '1' ? 'planned' : 'confirmed'
  return <TransactionEditor key={confirming ? `confirm-${transactionId}` : transactionId ?? initialStatus} {...props} transactionId={transactionId} initialStatus={initialStatus} confirming={confirming} />
}
