import { useState, type FormEvent } from 'react'
import { formatBalanceInput, parseHryvnias } from '../lib/money'
import type { Account, AccountFields } from './data'

const fieldClass = 'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30'

type AccountFormProps = {
  account?: Account
  isSaving: boolean
  onSave: (fields: AccountFields) => void
  onCancel: () => void
}

export default function AccountForm({ account, isSaving, onSave, onCancel }: AccountFormProps) {
  const [errorMessage, setErrorMessage] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return

    const fields = new FormData(event.currentTarget)
    const name = String(fields.get('name') ?? '').trim()
    const type = fields.get('type')
    const initialBalance = parseHryvnias(String(fields.get('initialBalance') ?? ''))

    if (!name) {
      setErrorMessage('Введіть назву рахунку.')
      return
    }
    if (type !== 'card' && type !== 'cash') {
      setErrorMessage('Оберіть тип рахунку.')
      return
    }
    if (initialBalance === null) {
      setErrorMessage('Введіть суму в гривнях із не більш ніж двома знаками після коми.')
      return
    }

    setErrorMessage('')
    onSave({ name, type, initial_balance_kop: initialBalance.toString() })
  }

  return (
    <form aria-labelledby="account-form-heading" onSubmit={handleSubmit} className="max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
      <h2 id="account-form-heading" className="text-lg font-semibold">
        {account ? 'Редагувати рахунок' : 'Новий рахунок'}
      </h2>

      <fieldset disabled={isSaving} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium sm:col-span-2">
          Назва рахунку
          <input name="name" className={fieldClass} defaultValue={account?.name} autoFocus required />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Тип рахунку
          <select name="type" className={fieldClass} defaultValue={account?.type ?? 'card'}>
            <option value="card">Картка</option>
            <option value="cash">Готівка</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Початковий баланс, грн
          <input
            name="initialBalance"
            className={fieldClass}
            autoComplete="off"
            defaultValue={formatBalanceInput(BigInt(account?.initial_balance_kop ?? '0'))}
            required
          />
        </label>
      </fieldset>

      {errorMessage && <p role="alert" className="mt-4 text-sm text-rose-300">{errorMessage}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isSaving}
          className="min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60"
        >
          {isSaving ? 'Зберігаємо…' : 'Зберегти'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="min-h-11 rounded-xl px-4 text-sm font-medium text-zinc-300 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60"
        >
          Скасувати
        </button>
      </div>
    </form>
  )
}
