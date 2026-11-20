import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AccountPicker from '../accounts/AccountPicker'
import { getAccountBalance, type Account } from '../accounts/data'
import { getAvailableCategories, type Category, type CategoryType } from '../categories/data'
import { isDateOnOrBefore, todayInKyiv } from '../lib/dates'
import { formatBalanceInput, formatKopecks, parseHryvnias } from '../lib/money'
import type { Currency, Transaction, TransactionFields } from './data'
import { convertToUah, parseExchangeRate } from './exchange'

const fieldClass = 'min-w-0 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30'
const invalidSelectionMessage = 'Оберіть рахунок і категорію.'

function Field({ id, label, children, wide = false }: { id: string; label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`grid min-w-0 gap-2 text-sm font-medium ${wide ? 'sm:col-span-2' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  )
}

type TransactionFormProps = {
  accounts: Account[]
  changesByAccount: ReadonlyMap<string, bigint> | null
  categories: Category[]
  transaction: Transaction | null
  lastUsdRate: string
  isSaving: boolean
  saveError: boolean
  onSave: (fields: TransactionFields) => void
}

export default function TransactionForm({ accounts, changesByAccount, categories, transaction, lastUsdRate, isSaving, saveError, onSave }: TransactionFormProps) {
  const activeAccounts = accounts.filter((account) => !account.is_hidden)
  const [accountId, setAccountId] = useState(transaction?.account_id ?? (activeAccounts.length === 1 ? activeAccounts[0].id : ''))
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? '')
  const [type, setType] = useState<CategoryType>(transaction?.type ?? 'expense')
  const [currency, setCurrency] = useState<Currency>(transaction?.currency ?? 'UAH')
  const [amountInput, setAmountInput] = useState(transaction ? formatBalanceInput(BigInt(transaction.amount_original_kop)) : '')
  const [rateInput, setRateInput] = useState((transaction?.currency === 'USD' ? transaction.rate : lastUsdRate).replace('.', ','))
  const [purchaseName, setPurchaseName] = useState(transaction?.purchase_name ?? '')
  const [errorMessage, setErrorMessage] = useState('')

  const availableCategories = getAvailableCategories(categories, type)
  const keptAccount = accounts.find((account) => account.is_hidden && account.id === accountId && account.id === transaction?.account_id)
  const keptCategory = categories.find((category) =>
    category.is_hidden && category.type === type && category.id === categoryId && category.id === transaction?.category_id,
  )
  const validAccount = Boolean(keptAccount) || activeAccounts.some(({ id }) => id === accountId)
  const validCategory = Boolean(keptCategory) || availableCategories.some(({ id }) => id === categoryId)
  const amount = parseHryvnias(amountInput)
  const rate = currency === 'UAH' ? '1' : parseExchangeRate(rateInput)
  const converted = amount !== null && amount > 0n && rate ? convertToUah(amount, rate) : null
  const today = todayInKyiv()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return

    const fields = new FormData(event.currentTarget)
    const date = String(fields.get('date') ?? '')
    if (!isDateOnOrBefore(date, todayInKyiv())) {
      setErrorMessage('Вкажіть коректну дату, не пізнішу за сьогодні.')
      return
    }
    if (!validAccount || !validCategory) {
      setErrorMessage(invalidSelectionMessage)
      return
    }
    if (amount === null || amount <= 0n) {
      setErrorMessage('Введіть додатну суму з точністю до двох знаків після коми.')
      return
    }
    if (!rate) {
      setErrorMessage('Введіть додатний курс долара.')
      return
    }
    if (converted === null) {
      setErrorMessage('Сума в гривнях завелика.')
      return
    }

    setErrorMessage('')
    onSave({
      account_id: accountId,
      category_id: categoryId,
      type,
      date,
      currency,
      amount_original_kop: amount.toString(),
      rate,
      purchase_name: type === 'expense' ? purchaseName.trim() || null : null,
      comment: String(fields.get('comment') ?? '').trim() || null,
    })
  }

  return (
    <form aria-label={transaction ? 'Редагувати транзакцію' : 'Додати транзакцію'} onSubmit={handleSubmit} className="mt-6 max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
      <fieldset disabled={isSaving} className="grid min-w-0 gap-4 sm:grid-cols-2">
        {type === 'expense' && (
          <Field id="transaction-purchase-name" label="Назва покупки (необов’язково)" wide>
            <input id="transaction-purchase-name" className={fieldClass} value={purchaseName} onChange={(event) => setPurchaseName(event.target.value)} />
          </Field>
        )}
        <Field id="transaction-type" label="Тип операції">
          <select id="transaction-type" className={fieldClass} value={type} onChange={(event) => {
            setType(event.target.value === 'income' ? 'income' : 'expense')
            setCategoryId('')
          }}>
            <option value="expense">Витрата</option>
            <option value="income">Дохід</option>
          </select>
        </Field>
        <Field id="transaction-date" label="Дата">
          <input id="transaction-date" type="date" name="date" className={fieldClass} defaultValue={transaction?.date ?? today} max={today} required />
        </Field>
        <Field id="transaction-amount" label="Сума">
          <input id="transaction-amount" className={fieldClass} inputMode="decimal" value={amountInput} onChange={(event) => setAmountInput(event.target.value)} autoFocus required />
        </Field>
        <Field id="transaction-currency" label="Валюта">
          <select id="transaction-currency" className={fieldClass} value={currency} onChange={(event) => setCurrency(event.target.value === 'USD' ? 'USD' : 'UAH')}>
            <option value="UAH">Гривня (UAH)</option>
            <option value="USD">Долар США (USD)</option>
          </select>
        </Field>
        {currency === 'USD' && (
          <>
            <Field id="transaction-rate" label="Курс, грн за 1 USD">
              <input id="transaction-rate" className={fieldClass} inputMode="decimal" value={rateInput} onChange={(event) => setRateInput(event.target.value)} required />
            </Field>
            <div className="grid min-w-0 gap-2 text-sm font-medium">
              Сума в гривнях
              <output aria-label="Сума в гривнях" className="min-w-0 py-2.5 font-semibold tabular-nums [overflow-wrap:anywhere]">
                {converted === null ? '—' : formatKopecks(converted)}
              </output>
            </div>
          </>
        )}
        {changesByAccount ? (
          <AccountPicker
            id="transaction-account"
            label="Рахунок"
            accounts={activeAccounts.map((account) => ({
              id: account.id,
              name: account.name,
              balance: getAccountBalance(account, changesByAccount),
            }))}
            value={accountId}
            onChange={(id) => {
              setAccountId(id)
              setErrorMessage((message) => message === invalidSelectionMessage ? '' : message)
            }}
          />
        ) : (
          <Field id="transaction-account" label="Рахунок">
            <select id="transaction-account" className={fieldClass} value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
              <option value="" disabled>Оберіть рахунок</option>
              {keptAccount && <option value={keptAccount.id} disabled>{keptAccount.name} (приховано)</option>}
              {activeAccounts.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select>
          </Field>
        )}
        <Field id="transaction-category" label="Категорія">
          <select id="transaction-category" className={fieldClass} value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
            <option value="" disabled>Оберіть категорію</option>
            {keptCategory && <option value={keptCategory.id} disabled>{keptCategory.name} (приховано)</option>}
            {availableCategories.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </Field>
        <Field id="transaction-comment" label="Коментар (необов’язково)" wide>
          <textarea id="transaction-comment" name="comment" rows={2} className={fieldClass} defaultValue={transaction?.comment ?? ''} />
        </Field>
      </fieldset>

      {!activeAccounts.length && !keptAccount && (
        <p className="mt-4 text-sm text-zinc-300">
          <Link to="/more/accounts" className="text-emerald-200 underline underline-offset-2">Додайте або відновіть рахунок</Link>, щоб зберегти транзакцію.
        </p>
      )}
      {!availableCategories.length && !keptCategory && (
        <p className="mt-4 text-sm text-zinc-300">
          <Link to="/more/categories" className="text-emerald-200 underline underline-offset-2">Додайте або відновіть категорію</Link> для цього типу операції.
        </p>
      )}
      {(errorMessage || saveError) && (
        <p role="alert" className="mt-4 text-sm text-rose-300">
          {errorMessage || 'Не вдалося зберегти транзакцію. Спробуйте ще раз.'}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={isSaving} className="min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60">
          {isSaving ? 'Зберігаємо…' : 'Зберегти'}
        </button>
        <Link to="/transactions" className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-medium text-zinc-300 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
          Скасувати
        </Link>
      </div>
    </form>
  )
}
