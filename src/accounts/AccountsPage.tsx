import type { OfflinePageProps } from '../offline/snapshot'
import { useEffect, useRef, useState } from 'react'
import { fitsDatabaseKopecks, formatKopecks } from '../lib/money'
import type { OperationStatus } from '../lib/operations'
import AccountForm from './AccountForm'
import { deleteAccount, getAccountBalance, loadAccountOverview, loadConfirmedBalanceChange, saveAccount, setAccountHidden, type Account, type AccountFields, type AccountOverview } from './data'

const buttonClass = 'min-h-11 rounded-xl border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-50'

type AccountListProps = {
  accounts: Account[]
  changesByAccount: AccountOverview['changesByAccount']
  isSaving: boolean
  readOnly: boolean
  accountToDelete: string | null
  deleteError?: string
  onEdit: (account: Account) => void
  onToggleHidden: (account: Account) => void
  onChooseDeletion: (id: string | null) => void
  onDelete: (account: Account) => void
}

function AccountList({
  accounts, changesByAccount, isSaving, readOnly, accountToDelete, deleteError, onEdit, onToggleHidden, onChooseDeletion, onDelete,
}: AccountListProps) {
  return (
    <ul className="grid gap-3 xl:grid-cols-2">
      {accounts.map((account) => {
        const balance = getAccountBalance(account, changesByAccount)
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
              {!readOnly && accountToDelete !== account.id && (
                <button type="button" className={buttonClass} disabled={isSaving}
                  aria-label={`Видалити рахунок ${account.name}`} onClick={() => onChooseDeletion(account.id)}>
                  Видалити
                </button>
              )}
            </div>
            {!readOnly && accountToDelete === account.id && (
              <div className="space-y-2 rounded-xl border border-rose-900/70 bg-rose-950/20 p-3 sm:col-span-2">
                <p className="text-sm text-rose-100 [overflow-wrap:anywhere]">Видалити рахунок «{account.name}»?</p>
                {deleteError && <p role="alert" className="text-sm text-rose-300">{deleteError}</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={isSaving} onClick={() => onDelete(account)}
                    className="min-h-11 rounded-xl bg-rose-300 px-3 text-sm font-semibold text-zinc-950 hover:bg-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300 disabled:opacity-50">
                    Так, видалити
                  </button>
                  <button type="button" className={buttonClass} disabled={isSaving} onClick={() => onChooseDeletion(null)}>
                    Скасувати
                  </button>
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default function AccountsPage({ client, snapshot, transactionOverlay, pendingTransfers, transferChanges }: OfflinePageProps) {
  const [overview, setOverview] = useState<AccountOverview | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const [editor, setEditor] = useState<{ id: string; account?: Account; currentBalance?: bigint } | null>(null)
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null)
  const saving = useRef(false)

  useEffect(() => {
    const controller = new AbortController()

    void loadAccountOverview(client, controller.signal, snapshot, transactionOverlay, pendingTransfers).then(
      (data) => {
        if (!controller.signal.aborted) setOverview(data)
      },
      () => {
        if (!controller.signal.aborted) setLoadError(true)
        controller.abort()
      },
    )

    return () => controller.abort()
  }, [client, loadAttempt, snapshot, transactionOverlay, pendingTransfers])

  function openEditor(account?: Account) {
    setFeedback(null)
    setAccountToDelete(null)
    const currentBalance = account && overview ? getAccountBalance(account, overview.changesByAccount) : undefined
    setEditor({ id: account?.id ?? crypto.randomUUID(), account, currentBalance })
  }

  async function applyAccountChange(
    id: string,
    request: () => Promise<Account | null>,
    successMessage: string,
    errorMessage: string,
  ): Promise<boolean> {
    if (snapshot || saving.current) return false

    saving.current = true
    setIsSaving(true)
    setFeedback(null)

    try {
      const account = await request()
      setOverview((current) => {
        if (!current) return current
        const otherAccounts = current.accounts.filter((row) => row.id !== id)
        return { ...current, accounts: account ? [...otherAccounts, account] : otherAccounts }
      })
      setFeedback({ message: successMessage, isError: false })
      return true
    } catch (error) {
      const linked = error && typeof error === 'object' && 'code' in error && error.code === '23503'
      setFeedback({
        message: linked ? 'Рахунок пов’язаний з операцією або шаблоном. Його можна приховати.'
          : error instanceof RangeError ? 'Розрахований початковий баланс виходить за допустимий діапазон.' : errorMessage,
        isError: true,
      })
      return false
    } finally {
      saving.current = false
      setIsSaving(false)
    }
  }

  async function handleSave(fields: AccountFields, desiredBalance?: bigint) {
    if (!editor) return
    const { id, account } = editor
    if (desiredBalance !== undefined && hasPendingOperations(id, 'confirmed')) {
      setFeedback({ message: 'Спочатку синхронізуй зміни операцій для цього рахунку.', isError: true })
      return
    }

    const saved = await applyAccountChange(
      id,
      async () => {
        if (desiredBalance === undefined) return saveAccount(client, id, fields, !account)
        const change = await loadConfirmedBalanceChange(client, id, AbortSignal.timeout(15_000))
        const initialBalance = desiredBalance - change
        if (!fitsDatabaseKopecks(initialBalance)) throw new RangeError('Initial balance is out of range')
        const savedAccount = await saveAccount(client, id, { ...fields, initial_balance_kop: initialBalance.toString() }, false)
        setOverview((current) => current && {
          ...current,
          changesByAccount: new Map(current.changesByAccount).set(id, change),
        })
        return savedAccount
      },
      desiredBalance !== undefined ? 'Поточний баланс оновлено.' : account ? 'Рахунок оновлено.' : 'Рахунок додано.',
      'Не вдалося зберегти рахунок. Спробуйте ще раз.',
    )
    if (saved) setEditor(null)
  }

  function handleToggleHidden(account: Account) {
    const isHidden = !account.is_hidden
    setAccountToDelete(null)
    void applyAccountChange(
      account.id,
      () => setAccountHidden(client, account.id, isHidden),
      isHidden ? 'Рахунок приховано.' : 'Рахунок відновлено.',
      'Не вдалося змінити видимість рахунку. Спробуйте ще раз.',
    )
  }

  function chooseDeletion(id: string | null) {
    setFeedback(null)
    setAccountToDelete(id)
  }

  function hasPendingOperations(id: string, status?: OperationStatus) {
    const hasPendingTransaction = (fields: { account_id: string; status: OperationStatus } | null) =>
      fields?.account_id === id && (!status || fields.status === status)
    const hasPendingTransfer = (fields: { from_account_id: string; to_account_id: string; status: OperationStatus } | null) =>
      fields && (fields.from_account_id === id || fields.to_account_id === id) && (!status || fields.status === status)
    return transactionOverlay?.drafts.some(hasPendingTransaction)
      || transactionOverlay?.changes.some(({ original, next }) => hasPendingTransaction(original) || hasPendingTransaction(next))
      || pendingTransfers?.some(({ fields }) => hasPendingTransfer(fields))
      || transferChanges?.some(({ original, next }) => hasPendingTransfer(original) || hasPendingTransfer(next))
  }

  async function handleDelete({ id }: Account) {
    if (hasPendingOperations(id)) {
      setFeedback({ message: 'Спочатку синхронізуй або прибери з черги операції для цього рахунку.', isError: true })
      return
    }
    const deleted = await applyAccountChange(id, async () => {
      await deleteAccount(client, id)
      return null
    }, 'Рахунок видалено.', 'Не вдалося видалити рахунок. Спробуй ще раз.')
    if (deleted) setAccountToDelete(null)
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
  const totalBalance = overview.accounts.reduce((total, account) => total + getAccountBalance(account, overview.changesByAccount), 0n)
  const listProps = {
    changesByAccount: overview.changesByAccount,
    isSaving: isSaving || !!snapshot || !!editor,
    readOnly: !!snapshot,
    accountToDelete,
    deleteError: feedback?.isError ? feedback.message : undefined,
    onEdit: openEditor,
    onToggleHidden: handleToggleHidden,
    onChooseDeletion: chooseDeletion,
    onDelete: handleDelete,
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <dl>
          <dt className="text-sm text-zinc-300">Загальний баланс</dt>
          <dd className={`mt-1 text-2xl font-semibold tabular-nums [overflow-wrap:anywhere] ${totalBalance < 0n ? 'text-rose-300' : ''}`}>
            {formatKopecks(totalBalance)}
          </dd>
        </dl>
        {hiddenAccounts.length > 0 && <p className="mt-1 text-sm text-zinc-400">Включно з прихованими рахунками.</p>}
      </div>
      {!editor && !snapshot && (
        <button type="button" disabled={isSaving} className={buttonClass} onClick={() => openEditor()}>
          Додати рахунок
        </button>
      )}
      {editor && (
        <AccountForm
          key={editor.id}
          account={editor.account}
          currentBalance={editor.currentBalance}
          isSaving={isSaving || !!snapshot}
          onSave={handleSave}
          onCancel={() => {
            setEditor(null)
            setFeedback(null)
          }}
        />
      )}
      {feedback && (!accountToDelete || !feedback.isError) && (
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
