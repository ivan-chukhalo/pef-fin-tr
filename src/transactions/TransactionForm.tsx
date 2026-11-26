import type { SupabaseClient } from '@supabase/supabase-js'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AccountPicker from '../accounts/AccountPicker'
import { categoryColorStyle } from '../categories/color'
import { getAccountBalance, type Account } from '../accounts/data'
import CreateCategoryDialog from '../categories/CreateCategoryDialog'
import { getAvailableCategories, type Category, type CategoryType } from '../categories/data'
import SubcategorySelect from '../categories/SubcategorySelect'
import { defaultSubcategoryId, getSubcategoryId, type Subcategory } from '../categories/subcategories'
import DateInput from '../lib/DateInput'
import { formatDate, isDateOnOrBefore, nextCalendarDate, todayInKyiv } from '../lib/dates'
import { formatBalanceInput, formatKopecks, parseHryvnias } from '../lib/money'
import OperationDateField from '../lib/OperationDateField'
import { getOperationDateError, getPlanningDate, type OperationStatus } from '../lib/operations'
import { frequencyLabels, recurringPath, type RecurringSchedule, type RecurringTemplate, type RecurringTemplateFields } from '../recurring/data'
import type { Currency, TransactionFields } from './data'
import { convertToUah, parseExchangeRate } from './exchange'
import { useNbuRate } from './useNbuRate'

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
  categoryClient?: SupabaseClient
  subcategories: Subcategory[]
  lastUsdRate: string
  isSaving: boolean
  saveError: boolean
  lastServerDate?: string
  offline?: boolean
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
  const { accounts, changesByAccount, categoryClient, subcategories, lastUsdRate, isSaving, saveError } = props
  const recurring = props.recurringTemplate !== undefined
  const transaction = recurring ? null : props.transaction
  const template = props.recurringTemplate
  const details = template ?? transaction
  const confirming = !recurring && props.confirming
  const activeAccounts = accounts.filter((account) => !account.is_hidden)
  const [accountId, setAccountId] = useState(details?.account_id ?? (activeAccounts.length === 1 ? activeAccounts[0].id : ''))
  const [categoryId, setCategoryId] = useState(details?.category_id ?? '')
  const [subcategoryId, setSubcategoryId] = useState(getSubcategoryId(details?.subcategory_id))
  const [addedCategories, setAddedCategories] = useState<Category[]>([])
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [type, setType] = useState<CategoryType>(details?.type ?? 'expense')
  const [status, setStatus] = useState(recurring ? 'planned' : props.initialStatus)
  const [currency, setCurrency] = useState<Currency>(details?.currency ?? 'UAH')
  const [amountInput, setAmountInput] = useState(details ? formatBalanceInput(BigInt(details.amount_original_kop)) : '')
  const [enteredRate, setEnteredRate] = useState<string | null>(null)
  const [initialToday] = useState(todayInKyiv)
  const [operationDate, setOperationDate] = useState(() => {
    if (recurring) return template?.start_date ?? nextCalendarDate(initialToday)
    if (confirming) return initialToday
    return transaction?.date ?? (status === 'planned' ? nextCalendarDate(getPlanningDate(props.lastServerDate)) : initialToday)
  })
  const [transactionName, setTransactionName] = useState(details?.purchase_name ?? '')
  const [errorMessage, setErrorMessage] = useState('')

  const savedRate = details?.currency === 'USD' ? details.rate : ''
  const suggestRate = currency === 'USD' && (confirming || !savedRate)
  const today = todayInKyiv()
  const rateDate = suggestRate && operationDate ? (operationDate > today ? today : operationDate) : null
  const { quote, loading: loadingRate } = useNbuRate(rateDate, !props.offline)
  const suggestedRate = (quote?.rate ?? (lastUsdRate || savedRate)).replace('.', ',')
  const defaultRate = suggestRate ? (loadingRate ? '' : suggestedRate) : savedRate.replace('.', ',')
  const rateInput = enteredRate ?? defaultRate
  let rateHint = ''
  if (suggestRate && !enteredRate) {
    if (loadingRate) rateHint = 'Завантажуємо курс НБУ…'
    else if (quote) {
      const source = quote.date === operationDate ? 'Курс НБУ' : 'Орієнтир — курс НБУ'
      rateHint = `${source} за ${formatDate(quote.date)}.`
    } else if (lastUsdRate) rateHint = 'Останній використаний курс.'
    else if (savedRate) rateHint = 'Курс із запланованої операції.'
  }

  const categories = [...props.categories, ...addedCategories.filter((category) => !props.categories.some(({ id }) => id === category.id))]
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
      : getOperationDateError(date, status, transaction?.date, props.lastServerDate)
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
      subcategory_id: subcategoryId,
      type,
      currency,
      amount_original_kop: amount.toString(),
      rate,
      purchase_name: transactionName.trim() || null,
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

  const form = (
    <form aria-label={formLabel} onSubmit={handleSubmit} className="mt-6 max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
      <fieldset disabled={isSaving} className="grid min-w-0 gap-4 sm:grid-cols-2 sm:items-start">
        <Field id="transaction-name" label={type === 'income' ? 'Назва доходу (необов’язково)' : 'Назва покупки (необов’язково)'} wide>
          <input id="transaction-name" className={fieldClass} value={transactionName} readOnly={confirming} onChange={(event) => setTransactionName(event.target.value)} />
        </Field>
        <Field id="transaction-type" label="Тип операції">
          <select id="transaction-type" className={fieldClass} value={type} disabled={confirming} onChange={(event) => {
            setType(event.target.value === 'income' ? 'income' : 'expense')
            setCategoryId('')
            setSubcategoryId(defaultSubcategoryId)
          }}>
            <option value="expense">Витрата</option>
            <option value="income">Дохід</option>
          </select>
        </Field>
        {recurring ? (
          <>
            <Field id="transaction-date" label="Дата першої операції">
              <DateInput id="transaction-date" name="date" className={fieldClass}
                defaultValue={template?.start_date ?? nextCalendarDate(initialToday)} onDateChange={setOperationDate} required />
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
            existingDate={confirming ? initialToday : transaction?.date}
            status={status}
            onStatusChange={setStatus}
            onDateChange={setOperationDate}
            label={confirming ? 'Фактична дата' : 'Дата'}
            lastServerDate={props.lastServerDate}
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
              <input id="transaction-rate" className={fieldClass} inputMode="decimal" value={rateInput}
                placeholder={suggestRate ? suggestedRate : savedRate.replace('.', ',')}
                aria-describedby={rateHint ? 'transaction-rate-hint' : undefined}
                onChange={(event) => setEnteredRate(event.target.value)} required />
              {rateHint && <p id="transaction-rate-hint" role="status" className="text-xs font-normal text-zinc-400">{rateHint}</p>}
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
          <select id="transaction-category" className={fieldClass} style={categoryColorStyle(selectedCategory?.color)} value={categoryId} disabled={confirming} onChange={(event) => {
            setCategoryId(event.target.value)
            setSubcategoryId(defaultSubcategoryId)
          }} required>
            <option value="" disabled>Оберіть категорію</option>
            {keptCategory && <option value={keptCategory.id} disabled>{keptCategory.name} (приховано)</option>}
            {availableCategories.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
          {categoryClient && !confirming && !props.offline && (
            <button type="button" className="w-fit min-h-10 rounded-sm text-sm font-medium text-emerald-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
              onClick={() => setCreatingCategory(true)}>
              Додати категорію
            </button>
          )}
        </Field>
        <Field id="transaction-subcategory" label="Підкатегорія">
          <SubcategorySelect id="transaction-subcategory" className={fieldClass} categoryId={categoryId} subcategories={subcategories}
            value={subcategoryId} onChange={setSubcategoryId} disabled={confirming || !categoryId} />
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
      {!availableCategories.length && !keptCategory && (!categoryClient || props.offline || confirming) && (
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

  return (
    <>
      {form}
      {creatingCategory && categoryClient && (
        <CreateCategoryDialog client={categoryClient} type={type} onCancel={() => setCreatingCategory(false)}
          onCreated={(category) => {
            setAddedCategories((current) => [...current, category])
            setCategoryId(category.id)
            setSubcategoryId(defaultSubcategoryId)
            setErrorMessage((message) => message === invalidSelectionMessage ? '' : message)
            setCreatingCategory(false)
          }} />
      )}
    </>
  )
}
