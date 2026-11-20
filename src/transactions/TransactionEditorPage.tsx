import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { loadAccountOverview, loadAccounts } from '../accounts/data'
import { loadCategories } from '../categories/data'
import { useLoadData } from '../lib/useLoadData'
import { loadLastUsdRate, loadTransaction, saveTransaction, type TransactionFields } from './data'
import TransactionForm from './TransactionForm'

function TransactionEditor({ client, transactionId }: { client: SupabaseClient; transactionId?: string }) {
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
      transactionId ? loadTransaction(client, transactionId, signal) : null,
      loadLastUsdRate(client, signal),
    ])
    return { ...accountData, categories, transaction, lastUsdRate }
  }, [client, transactionId])
  const { data, hasError, retry } = useLoadData(load)

  async function handleSave(fields: TransactionFields) {
    if (saving.current) return

    saving.current = true
    setIsSaving(true)
    setSaveError(false)
    try {
      await saveTransaction(client, draftId, fields, !transactionId)
      navigate(`/transactions?month=${fields.date.slice(0, 7)}`, { replace: true })
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
        <Link to="/transactions" className="text-emerald-200 underline underline-offset-2">До списку транзакцій</Link>
      </div>
    )
  }

  return <TransactionForm {...data} isSaving={isSaving} saveError={saveError} onSave={handleSave} />
}

export default function TransactionEditorPage({ client }: { client: SupabaseClient }) {
  const { transactionId } = useParams()
  return <TransactionEditor key={transactionId ?? 'new'} client={client} transactionId={transactionId} />
}
