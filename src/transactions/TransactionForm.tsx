import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AccountPicker from '../accounts/AccountPicker'
import { categoryColorStyle } from '../categories/color'
import { getAccountBalance, type Account } from '../accounts/data'
import { getAvailableCategories, type Category, type CategoryType } from '../categories/data'
import { isDateOnOrBefore, nextCalendarDate, todayInKyiv } from '../lib/dates'
import { formatBalanceInput, formatKopecks, parseHryvnias } from '../lib/money'
import OperationDateField from '../lib/OperationDateField'
import { getOperationDateError, type OperationStatus } from '../lib/operations'
import { frequencyLabels, recurringPath, type RecurringSchedule, type RecurringTemplate, type RecurringTemplateFields } from '../recurring/data'
import type { Currency, TransactionFields } from './data'
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
  lastUsdRate: string
  isSaving: boolean
  saveError: boolean
} & ({
  recurringTemplate?: never
  transaction: TransactionFields | null
  initialStatus: OperationStatus
  confirming: boolean
  onSave: (fields: TransactionFields) => void
} | {
  recurringTemplate: RecurringTemplate | null
  onSave: (fields: RecurringTemplateFields) => void
})

function scheduleFitsCalendar(date: string, frequency: RecurringSchedule['frequency'], occurrences: number) {
  const last = new Date(`${date}T00:00:00Z`)
  if (frequency === 'weekly') last.setUTCDate(last.getUTCDate() + (occurrences - 1) * 7)
  else {
    last.setUTCDate(1)
    last.setUTCMonth(last.getUTCMonth() + occurrences - 1)
  }
  return last.getUTCFullYear() <= 9999
}

export default function TransactionForm(props: TransactionFormProps) {
  const { accounts, changesByAccount, categories, lastUsdRate, isSaving, saveError } = props
  const recurring = props.recurringTemplate !== undefined
  const transaction = recurring ? null : props.transaction
  const template = props.recurringTemplate
  const details = template ?? transaction
  const confirming = !recurring && props.confirming
  const activeAccounts = accounts.filter((account) => !account.is_hidden)
  const [accountId, setAccountId] = useState(details?.account_id ?? (activeAccounts.length === 1 ? activeAccounts[0].id : ''))
  const [categoryId, setCategoryId] = useState(details?.category_id ?? '')
  const [type, setType] = useState<CategoryType>(details?.type ?? 'expense')
  const [status, setStatus] = useState(recurring ? 'planned' : props.initialStatus)
  const [currency, setCurrency] = useState<Currency>(details?.currency ?? 'UAH')
  const [amountInput, setAmountInput] = useState(details ? formatBalanceInput(BigInt(details.amount_original_kop)) : '')
  const [rateInput, setRateInput] = useState((details?.currency === 'USD' ? details.rate : lastUsdRate).replace('.', ','))
  const [purchaseName, setPurchaseName] = useState(details?.purchase_name ?? '')
  const [errorMessage, setErrorMessage] = useState('')

  const availableCategories = getAvailableCategories(categories, type)
  const keptAccount = accounts.find((account) => account.is_hidden && account.id === accountId && account.id === details?.account_id)
  const keptCategory = categories.find((category) =>
    category.is_hidden && category.type === type && category.id === categoryId && category.id === details?.category_id,
  )
  const selectedCategory = keptCategory ?? availableCategories.find(({ id }) => id === categoryId)
  const validAccount = Boolean(keptAccount) || activeAccounts.some(({ id }) => id === accountId)
  const validCategory = Boolean(selectedCategory)
  const amount = parseHryvnias(amountInput)
  const rate = currency === 'UAH' ? '1' : parseExchangeRate(rateInput)
  const converted = amount !== null && amount > 0n && rate ? convertToUah(amount, rate) : null
  const formLabel = recurring
    ? template ? 'Редагувати шаблон' : 'Додати шаблон'
    : confirming ? 'Підтвердити транзакцію' : transaction ? 'Редагувати транзакцію' : 'Додати транзакцію'
  const submitLabel = recurring ? 'Зберегти шаблон' : confirming ? 'Підтвердити' : !transaction && status === 'planned' ? 'Запланувати' : 'Зберегти'
  const cancelPath = recurring ? recurringPath : confirming || status === 'planned' ? '/transactions/planned' : '/transactions'
  const saveErrorMessage = recurring ? 'Не вдалося зберегти шаблон.'
    : confirming ? 'Не вдалося підтвердити транзакцію.' : 'Не вдалося зберегти транзакцію.'

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return

    const fields = new FormData(event.currentTarget)
    const date = String(fields.get('date') ?? '')
    const dateError = recurring
      ? isDateOnOrBefore(date) ? '' : 'Вкажіть коректну дату першої операції.'
      : getOperationDateError(date, status, transaction?.date)
    if (dateError) {
      setErrorMessage(dateError)
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

    const commonFields = {
      account_id: accountId,
      category_id: categoryId,
      type,
      currency,
      amount_original_kop: amount.toString(),
      rate,
      purchase_name: type === 'expense' ? purchaseName.trim() || null : null,
      comment: String(fields.get('comment') ?? '').trim() || null,
    }

    if (recurring) {
      const frequency = fields.get('frequency')
      const occurrences = Number(fields.get('occurrences'))
      if ((frequency !== 'weekly' && frequency !== 'monthly') || !Number.isInteger(occurrences) || occurrences < 1 || occurrences > 120) {
        setErrorMessage('Оберіть частоту та вкажіть від 1 до 120 повторень.')
        return
      }
      if (!scheduleFitsCalendar(date, frequency, occurrences)) {
        setErrorMessage('Остання операція має припадати на дату до кінця 9999 року.')
        return
      }
      setErrorMessage('')
      props.onSave({ ...commonFields, start_date: date, frequency, occurrences })
    } else {
      setErrorMessage('')
      props.onSave({ ...commonFields, date, status })
    }
  }

  return (
    <form aria-label={formLabel} onSubmit={handleSubmit} className="mt-6 max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
      <fieldset disabled={isSaving} className="grid min-w-0 gap-4 sm:grid-cols-2 sm:items-start">
        {type === 'expense' && (
          <Field id="transaction-purchase-name" label="Назва покупки (необов’язково)" wide>
            <input id="transaction-purchase-name" className={fieldClass} value={purchaseName} readOnly={confirming} onChange={(event) => setPurchaseName(event.target.value)} />
          </Field>
        )}
        <Field id="transaction-type" label="Тип операції">
          <select id="transaction-type" className={fieldClass} value={type} disabled={confirming} onChange={(event) => {
            setType(event.target.value === 'income' ? 'income' : 'expense')
            setCategoryId('')
          }}>
            <option value="expense">Витрата</option>
            <option value="income">Дохід</option>
          </select>
        </Field>
        {recurring ? (
          <>
            <Field id="transaction-date" label="Дата першої операції">
              <input id="transaction-date" name="date" type="date" className={fieldClass} defaultValue={template?.start_date ?? nextCalendarDate(todayInKyiv())} max="9999-12-31" required />
            </Field>
            <Field id="recurring-frequency" label="Частота">
              <select id="recurring-frequency" name="frequency" className={fieldClass} defaultValue={template?.frequency ?? 'monthly'}>
                {Object.entries(frequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field id="recurring-occurrences" label="Кількість операцій">
              <input id="recurring-occurrences" name="occurrences" type="number" className={fieldClass} defaultValue={template?.occurrences ?? 6} min={1} max={120} step={1} required />
            </Field>
          </>
        ) : (
          <OperationDateField
            id="transaction-date"
            fieldClass={fieldClass}
            existingDate={confirming ? todayInKyiv() : transaction?.date}
            status={status}
            onStatusChange={setStatus}
            label={confirming ? 'Фактична дата' : 'Дата'}
          />
        )}
        <Field id="transaction-amount" label="Сума">
          <input id="transaction-amount" className={fieldClass} inputMode="decimal" value={amountInput} onChange={(event) => setAmountInput(event.target.value)} autoFocus required />
        </Field>
        <Field id="transaction-currency" label="Валюта">
          <select id="transaction-currency" className={fieldClass} value={currency} disabled={confirming} onChange={(event) => setCurrency(event.target.value === 'USD' ? 'USD' : 'UAH')}>
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
            <select id="transaction-account" className={fieldClass} value={accountId} disabled={confirming} onChange={(event) => setAccountId(event.target.value)} required>
              <option value="" disabled>Оберіть рахунок</option>
              {keptAccount && <option value={keptAccount.id} disabled>{keptAccount.name} (приховано)</option>}
              {activeAccounts.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select>
          </Field>
        )}
        <Field id="transaction-category" label="Категорія">
          <select id="transaction-category" className={fieldClass} style={categoryColorStyle(selectedCategory?.color)} value={categoryId} disabled={confirming} onChange={(event) => setCategoryId(event.target.value)} required>
            <option value="" disabled>Оберіть категорію</option>
            {keptCategory && <option value={keptCategory.id} disabled>{keptCategory.name} (приховано)</option>}
            {availableCategories.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </Field>
        <Field id="transaction-comment" label="Коментар (необов’язково)" wide>
          <textarea id="transaction-comment" name="comment" rows={2} className={fieldClass} defaultValue={details?.comment ?? ''} readOnly={confirming} />
        </Field>
      </fieldset>

      {!activeAccounts.length && !keptAccount && (
        <p className="mt-4 text-sm text-zinc-300">
          <Link to="/more/accounts" className="text-emerald-200 underline underline-offset-2">Додайте або відновіть рахунок</Link>, щоб зберегти {recurring ? 'шаблон' : 'транзакцію'}.
        </p>
      )}
      {!availableCategories.length && !keptCategory && (
        <p className="mt-4 text-sm text-zinc-300">
          <Link to="/more/categories" className="text-emerald-200 underline underline-offset-2">Додайте або відновіть категорію</Link> для цього типу операції.
        </p>
      )}
      {(errorMessage || saveError) && (
        <p role="alert" className="mt-4 text-sm text-rose-300">
          {errorMessage || `${saveErrorMessage} Спробуйте ще раз.`}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={isSaving} className="min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60">
          {isSaving ? 'Зберігаємо…' : submitLabel}
        </button>
        <Link to={cancelPath} className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-medium text-zinc-300 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
          Скасувати
        </Link>
      </div>
    </form>
  )
}
