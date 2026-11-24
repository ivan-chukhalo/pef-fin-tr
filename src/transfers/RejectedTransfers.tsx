import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { Account } from '../accounts/data'
import DateInput from '../lib/DateInput'
import { formatDate, isDateOnOrBefore } from '../lib/dates'
import { formatKopecks } from '../lib/money'
import type { QueuedTransfer, ResolveRejectedTransfer } from './data'

const secondaryButtonClass = 'min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-medium hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60'

function RejectedTransferForm({ entry, accountNames, lastServerDate, onResolve }: {
  entry: QueuedTransfer
  accountNames: ReadonlyMap<string, string>
  lastServerDate?: string
  onResolve: ResolveRejectedTransfer
}) {
  const [confirmingRemoval, setConfirmingRemoval] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const saving = useRef(false)
  const { id, fields } = entry
  const inputId = `transfer-date-${id}`
  const from = accountNames.get(fields.from_account_id) ?? 'Рахунок'
  const to = accountNames.get(fields.to_account_id) ?? 'Рахунок'
  const canCorrectDate = entry.failure !== 'other' && !!lastServerDate

  function saveDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!lastServerDate || !canCorrectDate || confirmingRemoval) return
    const date = String(new FormData(event.currentTarget).get('date') ?? '')
    if (!isDateOnOrBefore(date, lastServerDate)) {
      setError(`Вкажи коректну дату, не пізнішу за ${formatDate(lastServerDate)}.`)
      return
    }
    void resolveTransfer(date)
  }

  async function resolveTransfer(date: string | null) {
    if (saving.current) return
    saving.current = true
    setIsSaving(true)
    setError('')
    try {
      await onResolve(id, fields.date, date)
    } catch {
      setError(date === null ? 'Не вдалося прибрати переказ із черги. Спробуй ще раз.'
        : 'Не вдалося оновити дату переказу. Спробуй ще раз.')
    } finally {
      saving.current = false
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={saveDate} aria-label={`Відхилений переказ з рахунку ${from} на рахунок ${to}`} className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="font-medium [overflow-wrap:anywhere]">{from} → {to}</p>
      <p className="text-sm tabular-nums text-zinc-300">{formatKopecks(BigInt(fields.amount_uah_kop))}</p>
      {entry.failure === 'date' && <p className="text-sm text-amber-200">Сервер відхилив дату переказу як майбутню.</p>}
      {canCorrectDate ? (
        <fieldset disabled={isSaving || confirmingRemoval} className="grid max-w-64 gap-2 text-sm">
          <label htmlFor={inputId} className="font-medium">Дата переказу</label>
          <DateInput id={inputId} name="date" defaultValue={fields.date} max={lastServerDate} required
            className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30"
          />
        </fieldset>
      ) : <time className="block text-sm text-zinc-300" dateTime={fields.date}>{formatDate(fields.date)}</time>}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {confirmingRemoval ? (
        <div className="space-y-3 rounded-xl border border-rose-900 bg-rose-950/20 p-3">
          <p className="text-sm text-rose-100">Прибрати цей переказ із черги на цьому пристрої? Баланси перерахуються.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={isSaving} onClick={() => void resolveTransfer(null)}
              className="min-h-11 rounded-xl bg-rose-300 px-4 text-sm font-semibold text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300 disabled:opacity-60">
              {isSaving ? 'Видаляємо…' : 'Так, прибрати'}
            </button>
            <button type="button" disabled={isSaving} className={secondaryButtonClass}
              onClick={() => { setError(''); setConfirmingRemoval(false) }}>
              Скасувати
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canCorrectDate && (
            <button type="submit" disabled={isSaving}
              className="min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-semibold text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60">
              {isSaving ? 'Зберігаємо…' : 'Зберегти дату'}
            </button>
          )}
          <button type="button" disabled={isSaving} className={secondaryButtonClass}
            onClick={() => { setError(''); setConfirmingRemoval(true) }}>
            Прибрати з черги
          </button>
        </div>
      )}
    </form>
  )
}

export default function RejectedTransfers({ accounts, pendingTransfers, lastServerDate, onResolve }: {
  accounts: readonly Account[]
  pendingTransfers?: readonly QueuedTransfer[]
  lastServerDate?: string
  onResolve: ResolveRejectedTransfer
}) {
  const rejected = pendingTransfers?.filter(({ delivery }) => delivery === 'failed') ?? []
  const accountNames = new Map(accounts.map(({ id, name }) => [id, name]))

  return (
    <section aria-labelledby="rejected-transfers" className="mt-6 max-w-2xl space-y-4">
      <h2 id="rejected-transfers" className="text-lg font-semibold">Відхилені перекази</h2>
      {!rejected.length ? (
        <p role="status" className="text-sm text-zinc-300">
          {pendingTransfers?.some(({ delivery }) => delivery !== 'failed')
            ? 'Переказ очікує синхронізації.' : 'У черзі немає відхилених переказів.'}
        </p>
      ) : (
        <>
          {lastServerDate && rejected.some(({ failure }) => failure !== 'other') && (
            <p className="text-sm text-zinc-300">Якщо переказ відбувся, вибери його фактичну дату. Сервер приймає дати до <time dateTime={lastServerDate}>{formatDate(lastServerDate)}</time> включно.</p>
          )}
          {rejected.map((entry) => <RejectedTransferForm key={entry.id} entry={entry} accountNames={accountNames} lastServerDate={lastServerDate} onResolve={onResolve} />)}
        </>
      )}
      <Link to="/more/accounts" className="inline-flex min-h-11 items-center rounded text-sm text-emerald-200 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">До рахунків</Link>
    </section>
  )
}
