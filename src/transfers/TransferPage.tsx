import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AccountPicker, { type AccountOption } from '../accounts/AccountPicker'
import { getAccountBalance, loadAccountOverview } from '../accounts/data'
import { formatDate } from '../lib/dates'
import { formatKopecks, parseHryvnias } from '../lib/money'
import OperationDateField from '../lib/OperationDateField'
import { getOperationDateError, type OperationStatus } from '../lib/operations'
import { useLoadData } from '../lib/useLoadData'
import { saveTransfer, type TransferFields, type TransferReceipt } from './data'

const fieldClass = 'min-w-0 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30'
const secondaryActionClass = 'inline-flex min-h-11 items-center rounded-xl border border-zinc-700 px-4 text-sm font-medium text-zinc-100 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300'
const primaryActionClass = 'inline-flex min-h-11 items-center rounded-xl bg-emerald-300 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60'
const invalidAccountsMessage = 'Оберіть два різні рахунки.'

function TransferForm({ accounts, initialStatus, isSaving, saveError, onSave }: {
  accounts: AccountOption[]
  initialStatus: OperationStatus
  isSaving: boolean
  saveError: boolean
  onSave: (fields: TransferFields) => void
}) {
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [status, setStatus] = useState(initialStatus)
  const [errorMessage, setErrorMessage] = useState('')

  function clearAccountSelectionError() {
    setErrorMessage((message) => message === invalidAccountsMessage ? '' : message)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return

    const fields = new FormData(event.currentTarget)
    const amount = parseHryvnias(String(fields.get('amount') ?? ''))
    const date = String(fields.get('date') ?? '')

    const dateError = getOperationDateError(date, status)
    if (dateError) {
      setErrorMessage(dateError)
      return
    }
    if (fromAccountId === toAccountId ||
      !accounts.some(({ id }) => id === fromAccountId) ||
      !accounts.some(({ id }) => id === toAccountId)) {
      setErrorMessage(invalidAccountsMessage)
      return
    }
    if (amount === null || amount <= 0n) {
      setErrorMessage('Введіть додатну суму в гривнях із точністю до двох знаків після коми.')
      return
    }

    setErrorMessage('')
    onSave({
      from_account_id: fromAccountId,
      to_account_id: toAccountId,
      date,
      status,
      amount_uah_kop: amount.toString(),
      comment: String(fields.get('comment') ?? '').trim() || null,
    })
  }

  return (
    <form aria-label="Переказ між рахунками" onSubmit={handleSubmit} className="mt-6 max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
      <fieldset disabled={isSaving} className="grid min-w-0 gap-4 sm:grid-cols-2 sm:items-start">
        <div className="grid min-w-0 gap-2 text-sm font-medium">
          <label htmlFor="transfer-amount">Сума, грн</label>
          <input id="transfer-amount" name="amount" inputMode="decimal" className={fieldClass} autoFocus required />
        </div>
        <OperationDateField id="transfer-date" fieldClass={fieldClass} status={status} onStatusChange={setStatus} />
        <AccountPicker id="transfer-from" label="З рахунку" accounts={accounts} value={fromAccountId} onChange={(nextAccountId) => {
          setFromAccountId(nextAccountId)
          if (nextAccountId === toAccountId) setToAccountId('')
          clearAccountSelectionError()
        }} />
        <AccountPicker id="transfer-to" label="На рахунок" accounts={accounts.filter(({ id }) => id !== fromAccountId)} value={toAccountId} onChange={(nextAccountId) => {
          setToAccountId(nextAccountId)
          clearAccountSelectionError()
        }} />
        <div className="grid min-w-0 gap-2 text-sm font-medium sm:col-span-2">
          <label htmlFor="transfer-comment">Коментар (необов’язково)</label>
          <textarea id="transfer-comment" name="comment" rows={2} className={fieldClass} />
        </div>
      </fieldset>
      {(errorMessage || saveError) && (
        <p role="alert" className="mt-4 text-sm text-rose-300">
          {errorMessage || 'Не вдалося підтвердити збереження переказу. Спробуйте ще раз.'}
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="submit" disabled={isSaving} className={primaryActionClass}>
          {isSaving ? 'Зберігаємо…' : status === 'planned' ? 'Запланувати' : 'Зберегти переказ'}
        </button>
        <Link to={status === 'planned' ? '/transactions/planned' : '/transactions'} className={secondaryActionClass}>Скасувати</Link>
      </div>
    </form>
  )
}

export default function TransferPage({ client }: { client: SupabaseClient }) {
  const [params] = useSearchParams()
  const initialStatus = params.get('plan') === '1' ? 'planned' : 'confirmed'
  const [draftId, setDraftId] = useState(() => crypto.randomUUID())
  const [receipt, setReceipt] = useState<TransferReceipt | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const saving = useRef(false)
  const load = useCallback((signal: AbortSignal) => loadAccountOverview(client, signal), [client])
  const { data: overview, setData: setOverview, hasError, retry } = useLoadData(load)

  async function handleSave(fields: TransferFields) {
    if (saving.current) return

    saving.current = true
    setIsSaving(true)
    setSaveError(false)
    try {
      setReceipt(await saveTransfer(client, draftId, fields))
    } catch {
      setSaveError(true)
    } finally {
      saving.current = false
      setIsSaving(false)
    }
  }

  if (!overview) {
    return hasError ? (
      <div className="mt-6 space-y-3">
        <p role="alert" className="text-sm text-rose-300">Не вдалося завантажити рахунки для переказу.</p>
        <button type="button" className={secondaryActionClass} onClick={retry}>Спробувати ще раз</button>
      </div>
    ) : <p role="status" className="mt-6 text-sm text-zinc-400">Завантажуємо рахунки…</p>
  }

  const { accounts, changesByAccount } = overview

  if (receipt) {
    const { transfer, savedEarlierWithDifferentDetails } = receipt
    const planned = transfer.status === 'planned'
    const source = accounts.find(({ id }) => id === transfer.from_account_id)?.name
    const destination = accounts.find(({ id }) => id === transfer.to_account_id)?.name

    return (
      <div className="mt-6 max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
        <p role="status" className="text-base font-semibold text-emerald-200">
          {savedEarlierWithDifferentDetails ? 'Попередній переказ уже збережено. Нижче його реквізити.' : planned ? 'Переказ заплановано.' : 'Переказ збережено.'}
        </p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-zinc-400">З рахунку</dt>
            <dd className="mt-1 font-medium [overflow-wrap:anywhere]">{source ?? 'Рахунок'}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-400">На рахунок</dt>
            <dd className="mt-1 font-medium [overflow-wrap:anywhere]">{destination ?? 'Рахунок'}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-400">Сума</dt>
            <dd className="mt-1 font-semibold tabular-nums [overflow-wrap:anywhere]">{formatKopecks(BigInt(transfer.amount_uah_kop))}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-400">Дата</dt>
            <dd className="mt-1"><time dateTime={transfer.date}>{formatDate(transfer.date)}</time></dd>
          </div>
          {transfer.comment && (
            <div className="sm:col-span-2">
              <dt className="text-sm text-zinc-400">Коментар</dt>
              <dd className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{transfer.comment}</dd>
            </div>
          )}
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to={planned ? '/transactions/planned' : '/more/accounts'} className={primaryActionClass}>{planned ? 'Заплановані' : 'До рахунків'}</Link>
          <button type="button" className={secondaryActionClass} onClick={() => {
            setDraftId(crypto.randomUUID())
            setReceipt(null)
            setOverview(null)
            retry()
          }}>
            Новий переказ
          </button>
        </div>
      </div>
    )
  }

  const activeAccounts = accounts.filter((account) => !account.is_hidden)
  if (activeAccounts.length < 2) {
    return (
      <div className="mt-6 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-sm text-zinc-300">Для переказу потрібно щонайменше два активні рахунки.</p>
        <Link to="/more/accounts" className={secondaryActionClass}>До рахунків</Link>
      </div>
    )
  }

  const accountOptions = activeAccounts.map((account) => ({
    id: account.id,
    name: account.name,
    balance: getAccountBalance(account, changesByAccount),
  }))

  return <TransferForm key={draftId} accounts={accountOptions} initialStatus={initialStatus} isSaving={isSaving} saveError={saveError} onSave={handleSave} />
}
