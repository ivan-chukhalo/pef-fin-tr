import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAccountBalance, getAccountBalanceChanges } from '../accounts/data'
import DateInput from '../lib/DateInput'
import { todayInKyiv } from '../lib/dates'
import { formatKopecks } from '../lib/money'
import { useLoadData } from '../lib/useLoadData'
import { absoluteKopecks, loadMonobankLedger, loadMonobankOptions, loadMonobankStatement, saveMonobankEntry, type MonobankImport } from './data'
import MonobankRow, { monobankButtonClass, monobankFieldClass } from './MonobankRow'
import { defaultStatementPeriod, earliestStatementDate, getStatementPeriodError, statementMaxDays, type StatementPeriod } from './period'
import type { MonobankEntry } from './types'

const primaryClass = 'min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60'

export default function MonobankPage({ client }: { client: SupabaseClient }) {
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      return { options: await loadMonobankOptions(client, signal), error: '' }
    } catch (error) {
      return { options: null, error: error instanceof Error ? error.message : 'Не вдалося підготувати імпорт monobank.' }
    }
  }, [client])
  const { data, setData, retry } = useLoadData(load)
  const [bankAccountId, setBankAccountId] = useState('')
  const [ledgerAccountId, setLedgerAccountId] = useState('')
  const [period, setPeriod] = useState(() => defaultStatementPeriod())
  const [statement, setStatement] = useState<MonobankEntry[] | null>(null)
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(() => new Set())
  const [fetching, setFetching] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null)
  const busy = useRef(false)

  if (!data) return <p role="status" className="mt-6 text-sm text-zinc-400">Завантажуємо рахунки…</p>

  if (!data.options) {
    return (
      <div className="mt-6 space-y-3">
        <p role="alert" className="text-sm text-rose-300">{data.error}</p>
        <button type="button" className={monobankButtonClass} onClick={() => { setData(null); retry() }}>Спробувати ще раз</button>
      </div>
    )
  }

  const { bankAccounts, accounts, categories, transactions, transfers } = data.options
  const activeAccounts = accounts.filter(({ is_hidden, type }) => !is_hidden && type === 'card')
  const bank = bankAccounts.find(({ id }) => id === (bankAccountId || (bankAccounts.length === 1 ? bankAccounts[0].id : '')))
  const ledger = activeAccounts.find(({ id }) => id === (ledgerAccountId || (activeAccounts.length === 1 ? activeAccounts[0].id : '')))
  const changes = getAccountBalanceChanges(
    transactions.filter(({ status }) => status === 'confirmed'),
    transfers.filter(({ status }) => status === 'confirmed'),
  )
  const known = new Set([...transactions, ...transfers].map(({ id }) => id))
  const rows = statement?.filter(({ id }) => !known.has(id) && !ignored.has(id)) ?? []
  const disabled = fetching || savingId !== null
  const today = todayInKyiv()
  const periodError = getStatementPeriodError(period, today)

  function clearStatement() {
    setStatement(null)
    setIgnored(new Set())
    setFeedback(null)
  }

  function changeAccount(updateId: (id: string) => void, id: string) {
    updateId(id)
    clearStatement()
  }

  function changePeriod(boundary: keyof StatementPeriod, date: string) {
    setPeriod((current) => ({ ...current, [boundary]: date }))
    clearStatement()
  }

  async function fetchStatement() {
    if (busy.current || !bank || !ledger || periodError) return

    busy.current = true
    setFetching(true)
    setFeedback(null)
    try {
      const [entries, latestLedger] = await Promise.all([
        loadMonobankStatement(client, bank.id, period),
        loadMonobankLedger(client),
      ])
      setData((current) => current?.options ? { ...current, options: { ...current.options, ...latestLedger } } : current)
      setStatement([...new Map(entries.map((entry) => [entry.id, entry])).values()].sort((first, second) => second.time - first.time))
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Не вдалося завантажити виписку.', error: true })
    } finally {
      busy.current = false
      setFetching(false)
    }
  }

  function ignoreEntry(id: string) {
    setIgnored((previous) => new Set([...previous, id]))
  }

  async function save(entry: MonobankEntry, operation: MonobankImport) {
    if (busy.current) return

    busy.current = true
    setSavingId(entry.id)
    setFeedback(null)
    try {
      const inserted = await saveMonobankEntry(client, entry.id, operation)
      if (inserted) {
        const id = entry.id
        setData((current) => {
          const options = current?.options
          if (!options) return current
          if (operation.kind === 'transfer') {
            return { ...current, options: { ...options, transfers: [...options.transfers, { ...operation.fields, id }] } }
          }
          const transaction = {
            ...operation.fields,
            id,
            created_at: new Date().toISOString(),
            amount_uah_kop: absoluteKopecks(entry.amountKop).toString(),
          }
          return { ...current, options: { ...options, transactions: [...options.transactions, transaction] } }
        })
      } else {
        const latestLedger = await loadMonobankLedger(client).catch(() => null)
        if (latestLedger) {
          setData((current) => current?.options ? { ...current, options: { ...current.options, ...latestLedger } } : current)
        }
      }
      ignoreEntry(entry.id)
      setFeedback({ text: inserted ? 'Операцію збережено.' : 'Цю банківську операцію вже збережено.', error: false })
    } catch {
      setFeedback({ text: 'Не вдалося зберегти операцію. Спробуй ще раз.', error: true })
    } finally {
      busy.current = false
      setSavingId(null)
    }
  }

  return (
    <div className="mt-6 max-w-3xl space-y-5">
      <section aria-label="Вибір рахунків" className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
        <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
          <label className="grid min-w-0 gap-2 text-sm font-medium">
            Рахунок monobank
            <select className={monobankFieldClass} value={bank?.id ?? ''} onChange={(event) => changeAccount(setBankAccountId, event.target.value)}>
              <option value="" disabled>Вибери рахунок monobank</option>
              {bankAccounts.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-medium">
            Рахунок в обліку
            <select className={monobankFieldClass} value={ledger?.id ?? ''} onChange={(event) => changeAccount(setLedgerAccountId, event.target.value)}>
              <option value="" disabled>Вибери рахунок в обліку</option>
              {activeAccounts.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <div className="grid min-w-0 gap-2 text-sm font-medium">
            <label htmlFor="monobank-from">З</label>
            <DateInput
              id="monobank-from"
              aria-label="Дата початку виписки"
              aria-describedby="monobank-period-help"
              aria-invalid={Boolean(periodError)}
              className={monobankFieldClass}
              min={earliestStatementDate}
              max={today}
              defaultValue={period.from}
              onDateChange={(value) => changePeriod('from', value)}
              required
            />
          </div>
          <div className="grid min-w-0 gap-2 text-sm font-medium">
            <label htmlFor="monobank-to">По</label>
            <DateInput
              id="monobank-to"
              aria-label="Дата закінчення виписки"
              aria-describedby="monobank-period-help"
              aria-invalid={Boolean(periodError)}
              className={monobankFieldClass}
              min={earliestStatementDate}
              max={today}
              defaultValue={period.to}
              onDateChange={(value) => changePeriod('to', value)}
              required
            />
          </div>
        </fieldset>
        <p id="monobank-period-help" className={`text-sm ${periodError ? 'text-rose-300' : 'text-zinc-400'}`} aria-live="polite">
          {periodError || `До ${statementMaxDays} дня включно із вибраними датами.`}
        </p>
        {bankAccounts.length === 0 && <p className="text-sm text-zinc-300">Monobank не надав гривневих рахунків.</p>}
        {activeAccounts.length === 0 && (
          <p className="text-sm text-zinc-300">
            <Link to="/more/accounts" className="text-emerald-200 underline underline-offset-2">Додай або віднови картку</Link> в обліку.
          </p>
        )}
        {(bank || ledger) && (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {bank && <div><dt className="text-zinc-400">Баланс за даними monobank</dt><dd className="mt-1 font-semibold tabular-nums">{formatKopecks(BigInt(bank.balanceKop))}</dd></div>}
            {ledger && <div><dt className="text-zinc-400">Баланс в обліку</dt><dd className="mt-1 font-semibold tabular-nums">{formatKopecks(getAccountBalance(ledger, changes))}</dd></div>}
          </dl>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={primaryClass} disabled={!bank || !ledger || disabled || Boolean(periodError)} onClick={() => void fetchStatement()}>
            {fetching ? 'Завантажуємо виписку…' : 'Підтягнути операції'}
          </button>
        </div>
      </section>
      {feedback && <p role={feedback.error ? 'alert' : 'status'} className={`text-sm ${feedback.error ? 'text-rose-300' : 'text-emerald-200'}`}>{feedback.text}</p>}
      {statement && (rows.length > 0 && ledger ? (
        <ul aria-label="Операції з monobank" className="grid gap-3">
          {rows.map((entry) => (
            <MonobankRow
              key={entry.id}
              entry={entry}
              accountId={ledger.id}
              accounts={accounts}
              categories={categories}
              transactions={transactions}
              transfers={transfers}
              busy={disabled}
              saving={savingId === entry.id}
              onSave={(operation) => void save(entry, operation)}
              onSkip={() => ignoreEntry(entry.id)}
            />
          ))}
        </ul>
      ) : <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">Нових операцій для перегляду немає.</p>)}
    </div>
  )
}
