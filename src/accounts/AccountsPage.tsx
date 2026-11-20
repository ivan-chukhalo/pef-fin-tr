import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import { formatKopecks } from '../lib/money'
import AccountForm from './AccountForm'
import { loadAccountOverview, saveAccount, setAccountHidden, type Account, type AccountFields, type AccountOverview } from './data'

const buttonClass = 'min-h-11 rounded-xl border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-50'

type AccountListProps = {
  accounts: Account[]
  changesByAccount: AccountOverview['changesByAccount']
  isSaving: boolean
  onEdit: (account: Account) => void
  onToggleHidden: (account: Account) => void
}

function AccountList({ accounts, changesByAccount, isSaving, onEdit, onToggleHidden }: AccountListProps) {
  return (
    <ul className="grid gap-3 xl:grid-cols-2">
      {accounts.map((account) => {
        const balance = BigInt(account.initial_balance_kop) + (changesByAccount.get(account.id) ?? 0n)
        const hideLabel = account.is_hidden ? 'Відновити' : 'Приховати'

        return (
          <li key={account.id} className="grid min-w-0 gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <h2 className="text-base font-semibold [overflow-wrap:anywhere]">{account.name}</h2>
              <p className="mt-1 text-sm text-zinc-400">{account.type === 'card' ? 'Картка' : 'Готівка'}</p>
            </div>
            <div className="min-w-0 sm:text-right">
              <p className="text-xs text-zinc-400">Поточний баланс</p>
              <p className="mt-1 text-xl font-semibold tabular-nums [overflow-wrap:anywhere]">{formatKopecks(balance)}</p>
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button
                type="button"
                className={buttonClass}
                disabled={isSaving}
                aria-label={`Редагувати рахунок ${account.name}`}
                onClick={() => onEdit(account)}
              >
                Редагувати
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={isSaving}
                aria-label={`${hideLabel} рахунок ${account.name}`}
                onClick={() => onToggleHidden(account)}
              >
                {hideLabel}
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default function AccountsPage({ client }: { client: SupabaseClient }) {
  const [overview, setOverview] = useState<AccountOverview | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const [editor, setEditor] = useState<{ id: string; account?: Account } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null)
  const saving = useRef(false)

  useEffect(() => {
    const controller = new AbortController()

    void loadAccountOverview(client, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setOverview(data)
      },
      () => {
        if (!controller.signal.aborted) setLoadError(true)
        controller.abort()
      },
    )

    return () => controller.abort()
  }, [client, loadAttempt])

  function openEditor(account?: Account) {
    setFeedback(null)
    setEditor({ id: account?.id ?? crypto.randomUUID(), account })
  }

  async function applyAccountChange(
    request: () => Promise<Account>,
    successMessage: string,
    errorMessage: string,
  ): Promise<boolean> {
    if (saving.current) return false

    saving.current = true
    setIsSaving(true)
    setFeedback(null)

    try {
      const account = await request()
      setOverview((current) => current && {
        ...current,
        accounts: [...current.accounts.filter(({ id }) => id !== account.id), account],
      })
      setFeedback({ message: successMessage, isError: false })
      return true
    } catch {
      setFeedback({ message: errorMessage, isError: true })
      return false
    } finally {
      saving.current = false
      setIsSaving(false)
    }
  }

  async function handleSave(fields: AccountFields) {
    if (!editor) return

    const saved = await applyAccountChange(
      () => saveAccount(client, editor.id, fields, !editor.account),
      editor.account ? 'Рахунок оновлено.' : 'Рахунок додано.',
      'Не вдалося зберегти рахунок. Спробуйте ще раз.',
    )
    if (saved) setEditor(null)
  }

  function handleToggleHidden(account: Account) {
    const isHidden = !account.is_hidden
    void applyAccountChange(
      () => setAccountHidden(client, account.id, isHidden),
      isHidden ? 'Рахунок приховано.' : 'Рахунок відновлено.',
      'Не вдалося змінити видимість рахунку. Спробуйте ще раз.',
    )
  }

  if (!overview) {
    return loadError ? (
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <p role="alert" className="text-sm text-rose-300">Не вдалося завантажити рахунки.</p>
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setLoadError(false)
            setLoadAttempt((attempt) => attempt + 1)
          }}
        >
          Спробувати ще раз
        </button>
      </div>
    ) : <p role="status" className="mt-6 text-sm text-zinc-400">Завантажуємо рахунки…</p>
  }

  const sortedAccounts = overview.accounts.toSorted((first, second) =>
    first.created_at.localeCompare(second.created_at) || first.id.localeCompare(second.id),
  )
  const visibleAccounts = sortedAccounts.filter((account) => !account.is_hidden)
  const hiddenAccounts = sortedAccounts.filter((account) => account.is_hidden)
  const listProps = {
    changesByAccount: overview.changesByAccount,
    isSaving,
    onEdit: openEditor,
    onToggleHidden: handleToggleHidden,
  }

  return (
    <div className="mt-6 space-y-5">
      {!editor && (
        <button type="button" disabled={isSaving} className={buttonClass} onClick={() => openEditor()}>
          Додати рахунок
        </button>
      )}
      {editor && (
        <AccountForm
          key={editor.id}
          account={editor.account}
          isSaving={isSaving}
          onSave={handleSave}
          onCancel={() => {
            setEditor(null)
            setFeedback(null)
          }}
        />
      )}
      {feedback && (
        <p role={feedback.isError ? 'alert' : 'status'} className={`text-sm ${feedback.isError ? 'text-rose-300' : 'text-emerald-200'}`}>
          {feedback.message}
        </p>
      )}
      {visibleAccounts.length ? <AccountList accounts={visibleAccounts} {...listProps} /> : (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
          {hiddenAccounts.length ? 'Активних рахунків немає.' : 'Рахунків ще немає.'}
        </p>
      )}
      {hiddenAccounts.length > 0 && (
        <details className="rounded-2xl border border-zinc-800 p-4">
          <summary className="cursor-pointer rounded-sm text-sm font-medium text-zinc-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
            Приховані рахунки ({hiddenAccounts.length})
          </summary>
          <div className="mt-4">
            <AccountList accounts={hiddenAccounts} {...listProps} />
          </div>
        </details>
      )}
    </div>
  )
}
