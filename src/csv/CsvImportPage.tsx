import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { categoryColorStyle } from '../categories/color'
import CreateCategoryDialog from '../categories/CreateCategoryDialog'
import CreateSubcategoryDialog from '../categories/CreateSubcategoryDialog'
import { getAvailableCategories, type Category } from '../categories/data'
import SubcategorySelect from '../categories/SubcategorySelect'
import { defaultSubcategoryId, getSubcategoryId, getSubcategoryNameError, type Subcategory } from '../categories/subcategories'
import { formatDate } from '../lib/dates'
import { formatBalanceInput, formatKopecks } from '../lib/money'
import { useLoadData } from '../lib/useLoadData'
import type { OfflinePageProps } from '../offline/snapshot'
import { loadTransactionOptions } from '../transactions/data'
import { csvColumns, detectCsvMapping, matchCsvSubcategory, prepareCsvImport, saveCsvImport, type CsvMapping, type CsvRow, type CsvTransaction } from './data'
import { readCsvFile, type CsvFile } from './parse'

const fieldClass = 'mt-1 min-h-11 w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-300/30'
const buttonClass = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-700 px-4 text-sm font-medium hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-50'
const submitClass = 'min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-50'
const createButtonClass = 'min-h-10 rounded-sm text-sm font-medium text-emerald-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300'
const rowsPerPage = 25

export default function CsvImportPage({ client, transactionOverlay, pendingTransfers }: Pick<OfflinePageProps, 'client' | 'transactionOverlay' | 'pendingTransfers'>) {
  const load = useCallback((signal: AbortSignal) => loadTransactionOptions(client, signal), [client])
  const { data, setData, hasError, retry } = useLoadData(load)
  const [file, setFile] = useState<CsvFile | null>(null)
  const [mapping, setMapping] = useState<CsvMapping>({})
  const [accountId, setAccountId] = useState('')
  const [preview, setPreview] = useState<CsvRow[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)

  const accounts = data?.accounts.filter(({ is_hidden }) => !is_hidden) ?? []
  const account = accounts.find(({ id }) => id === accountId) ?? (accounts.length === 1 ? accounts[0] : undefined)
  const mappedColumns = Object.values(mapping).filter((index) => index !== undefined)
  const duplicateColumns = mappedColumns.length !== new Set(mappedColumns).size

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const next = input.files?.[0]
    setPreview(null)
    setError('')
    setFile(null)
    if (!next) return
    setBusy(true)
    try {
      const parsed = await readCsvFile(next)
      setMapping(detectCsvMapping(parsed.headers))
      setFile(parsed)
    } catch (error) {
      input.value = ''
      setError(error instanceof Error ? error.message : 'Не вдалося прочитати файл.')
    } finally {
      setBusy(false)
    }
  }

  async function showPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || !account || !data || busy || saving || duplicateColumns || mapping.date === undefined || mapping.amount === undefined) return
    setPreview(null)
    setError('')
    setBusy(true)
    try {
      const rows = await prepareCsvImport(client, file, mapping, account.id, data.categories, data.subcategories, transactionOverlay, pendingTransfers)
      setPreview(rows)
    } catch {
      setError('Не вдалося перевірити операції в обліку. Спробуй ще раз.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 max-w-4xl space-y-5">
      <Link to="/transactions" className={buttonClass}>До транзакцій</Link>
      {hasError && (
        <div className="space-y-2">
          <p role="alert" className="text-rose-300">Не вдалося завантажити рахунки й категорії.</p>
          <button type="button" className={buttonClass} onClick={retry}>Спробувати ще раз</button>
        </div>
      )}
      {!hasError && !data && <p role="status" className="text-zinc-400">Завантажуємо рахунки й категорії…</p>}
      {data && !accounts.length && <p className="text-zinc-400">Спочатку додай активний рахунок у розділі «Рахунки».</p>}
      {data && !!accounts.length && (
        <form onSubmit={showPreview} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
          <fieldset disabled={busy || saving} className="min-w-0 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="min-w-0 text-sm font-medium">
                Файл CSV
                <input type="file" accept=".csv,text/csv" className={fieldClass} aria-describedby="csv-file-help" onChange={(event) => void selectFile(event)} />
              </label>
              <label className="text-sm font-medium">
                Рахунок для імпорту
                <select className={fieldClass} value={account?.id ?? ''} onChange={(event) => {
                  setAccountId(event.target.value)
                  setPreview(null)
                }}>
                  <option value="" disabled>Вибери рахунок</option>
                  {accounts.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
            </div>
            <p id="csv-file-help" className="text-sm text-zinc-400">
              До 1 МБ і 1000 операцій. Перший рядок має містити назви колонок. Підтримуються кома, крапка з комою й табуляція.
            </p>
            {file && (
              <div className="space-y-3">
                <h2 className="font-semibold">Відповідність колонок</h2>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  {csvColumns.map((column) => (
                    <label key={column.key} className="min-w-0 text-sm font-medium">
                      {column.label}
                      <select className={fieldClass} value={mapping[column.key] ?? ''} onChange={(event) => {
                        const index = event.target.value
                        setMapping((current) => ({ ...current, [column.key]: index === '' ? undefined : Number(index) }))
                        setPreview(null)
                      }}>
                        <option value="">{'required' in column ? 'Вибери колонку' : 'Пропустити'}</option>
                        {file.headers.map((header, index) => <option key={index} value={index}>{index + 1}. {header || 'Без назви'}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                {duplicateColumns && <p role="alert" className="text-sm text-rose-300">Кожну колонку можна використати лише один раз.</p>}
                <p className="text-sm text-zinc-400">
                  Обов’язкові дата й сума. Без колонки типу від’ємна сума означає витрату, додатна — дохід.
                  Без колонки валюти суми вважаються гривневими. Для USD потрібен курс.
                </p>
              </div>
            )}
            <button className={buttonClass} type="submit"
              disabled={!file || !account || duplicateColumns || mapping.date === undefined || mapping.amount === undefined}>
              {busy ? 'Перевіряємо…' : 'Переглянути операції'}
            </button>
          </fieldset>
          {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
        </form>
      )}
      {data && account && preview && (
        <CsvPreview client={client} account={account} categories={data.categories} subcategories={data.subcategories}
          rows={preview} saving={saving} setSaving={setSaving}
          onCategoryCreated={(category) => setData((current) => current && {
            ...current,
            categories: [...current.categories.filter(({ id }) => id !== category.id), category],
          })} onSubcategoryCreated={(subcategory) => setData((current) => current && {
            ...current,
            subcategories: [...current.subcategories.filter(({ id }) => id !== subcategory.id), subcategory],
          })} />
      )}
    </div>
  )
}

type EditableRow = Extract<CsvRow, { transaction: CsvTransaction }> & { selected: boolean }
type PreviewRow = Extract<CsvRow, { error: string }> | EditableRow
type Creation = { kind: 'category'; row: EditableRow } | { kind: 'subcategory'; row: EditableRow; category: Category }

function CsvPreview({ client, account, categories, subcategories, rows, saving, setSaving, onCategoryCreated, onSubcategoryCreated }: {
  client: SupabaseClient
  account: { id: string; name: string }
  categories: Category[]
  subcategories: Subcategory[]
  rows: CsvRow[]
  saving: boolean
  setSaving: (value: boolean) => void
  onCategoryCreated: (category: Category) => void
  onSubcategoryCreated: (subcategory: Subcategory) => void
}) {
  const [entries, setEntries] = useState<PreviewRow[]>(() => rows.map((row) =>
    'error' in row ? row : { ...row, selected: !row.existing && !row.possibleMatch },
  ))
  const [page, setPage] = useState(1)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [creation, setCreation] = useState<Creation | null>(null)
  const options = { income: getAvailableCategories(categories, 'income'), expense: getAvailableCategories(categories, 'expense') }
  const editable = entries.filter((row): row is EditableRow => 'transaction' in row && !row.existing)
  const selected = editable.filter((row) => row.selected)
  const missingCategories = selected.filter(({ transaction }) => !transaction.category_id).length
  const hasMatches = editable.some((row) => row.possibleMatch)
  const invalidCount = entries.filter((row) => 'error' in row).length
  const pageCount = Math.ceil(entries.length / rowsPerPage)

  function updateEntry(line: number, update: (row: EditableRow) => EditableRow) {
    setEntries((current) => current.map((row) => 'transaction' in row && row.line === line ? update(row) : row))
  }

  function assignCategory(row: EditableRow, categoryId: string): EditableRow {
    const subcategoryId = matchCsvSubcategory(subcategories, categoryId, row.subcategoryName)
    return { ...row, transaction: { ...row.transaction, category_id: categoryId, subcategory_id: subcategoryId } }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !selected.length || missingCategories) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const submitted = selected.map(({ transaction }) => ({ ...transaction, purchase_name: transaction.purchase_name?.trim() || null }))
      const inserted = await saveCsvImport(client, submitted)
      const savedIds = new Set(submitted.map(({ id }) => id))
      setEntries((current) => current.map((row) => 'transaction' in row && savedIds.has(row.transaction.id)
        ? { ...row, existing: true, selected: false } : row))
      const alreadySaved = submitted.length - inserted
      setMessage(`Додано операцій: ${inserted}.${alreadySaved ? ` Уже були в обліку: ${alreadySaved}.` : ''}`)
    } catch {
      setError('Не вдалося підтвердити імпорт. Спробуй ще раз. Якщо операції вже збережені, застосунок пропустить їх.')
    } finally {
      setSaving(false)
    }
  }

  const form = (
    <form onSubmit={save} className="space-y-4">
      <fieldset disabled={saving} className="min-w-0 space-y-4">
        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
          <div>
            <h2 className="font-semibold">Операції для рахунку «{account.name}»</h2>
            <p className="mt-1 text-sm text-zinc-400" role="status">
              Вибрано {selected.length} з {entries.length}.
              {missingCategories > 0 && ` Без категорії: ${missingCategories}.`}
              {invalidCount > 0 && ` З помилками: ${invalidCount}.`}
            </p>
          </div>
          {hasMatches && <p className="text-sm text-amber-200">Можливі збіги з операціями в обліку пропущено. Познач потрібні рядки вручну.</p>}
          {editable.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass} onClick={() => setEntries((current) => current.map((row) =>
                'error' in row || row.existing ? row : { ...row, selected: !row.possibleMatch },
              ))}>Вибрати без збігів</button>
              <button type="button" className={buttonClass} onClick={() => setEntries((current) => current.map((row) =>
                'error' in row ? row : { ...row, selected: false },
              ))}>Зняти вибір</button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {(['expense', 'income'] as const).map((type) => editable.some(({ transaction }) => transaction.type === type && !transaction.category_id) && (
              <label key={type} className="text-sm font-medium">
                {type === 'expense' ? 'Заповнити порожні категорії витрат' : 'Заповнити порожні категорії доходів'}
                <select className={fieldClass} value="" onChange={(event) => {
                  const categoryId = event.target.value
                  setEntries((current) => current.map((row) =>
                    'transaction' in row && !row.existing && row.transaction.type === type && !row.transaction.category_id
                      ? assignCategory(row, categoryId) : row,
                  ))
                }}>
                  <option value="">Вибери категорію</option>
                  {options[type].map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
        <ul aria-label="Попередній перегляд CSV" className="space-y-3">
          {entries.slice((page - 1) * rowsPerPage, page * rowsPerPage).map((row) => (
            <li key={row.line} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              {'error' in row
                ? <p className="text-sm text-rose-300">Рядок {row.line}. {row.error}</p>
                : <CsvPreviewRow row={row} categories={options[row.transaction.type]} subcategories={subcategories}
                    onCategoryChange={(id) => updateEntry(row.line, (current) => assignCategory(current, id))}
                    onAddCategory={() => setCreation({ kind: 'category', row })}
                    onAddSubcategory={(category) => setCreation({ kind: 'subcategory', row, category })}
                    onChange={(update) => updateEntry(row.line, update)} />}
            </li>
          ))}
        </ul>
        {pageCount > 1 && (
          <nav aria-label="Сторінки попереднього перегляду" className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
            <button type="button" className={buttonClass} disabled={page === 1} onClick={() => setPage(page - 1)}>Назад</button>
            <span>Сторінка {page} з {pageCount}</span>
            <button type="button" className={buttonClass} disabled={page === pageCount} onClick={() => setPage(page + 1)}>Далі</button>
          </nav>
        )}
        <button type="submit" className={submitClass} disabled={!selected.length || missingCategories > 0}>
          {saving ? 'Імпортуємо…' : 'Імпортувати вибрані'}
        </button>
      </fieldset>
      {message && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-emerald-200">{message}</p>
          <Link to={`/transactions?${new URLSearchParams({ month: '', account: account.id })}`} className={buttonClass}>
            Переглянути транзакції рахунку
          </Link>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    </form>
  )

  return (
    <>
      {form}
      {creation?.kind === 'category' && (
        <CreateCategoryDialog client={client} type={creation.row.transaction.type}
          initialName={creation.row.transaction.category_id ? '' : creation.row.categoryName}
          onCancel={() => setCreation(null)} onCreated={(category) => {
            onCategoryCreated(category)
            updateEntry(creation.row.line, (row) => assignCategory(row, category.id))
            setCreation(null)
          }} />
      )}
      {creation?.kind === 'subcategory' && (
        <CreateSubcategoryDialog client={client} category={creation.category} subcategories={subcategories}
          initialName={getSubcategoryId(creation.row.transaction.subcategory_id) === defaultSubcategoryId &&
            !getSubcategoryNameError(creation.row.subcategoryName, subcategories, creation.category.id) ? creation.row.subcategoryName : ''}
          onCancel={() => setCreation(null)} onCreated={(subcategory) => {
            onSubcategoryCreated(subcategory)
            updateEntry(creation.row.line, (row) => ({ ...row, transaction: { ...row.transaction, subcategory_id: subcategory.id } }))
            setCreation(null)
          }} />
      )}
    </>
  )
}

function CsvPreviewRow({ row, categories, subcategories, onCategoryChange, onAddCategory, onAddSubcategory, onChange }: {
  row: EditableRow
  categories: Category[]
  subcategories: Subcategory[]
  onCategoryChange: (id: string) => void
  onAddCategory: () => void
  onAddSubcategory: (category: Category) => void
  onChange: (update: (row: EditableRow) => EditableRow) => void
}) {
  const { transaction, line } = row
  const expense = transaction.type === 'expense'
  const detailsId = `csv-row-${line}-details`
  const category = categories.find(({ id }) => id === transaction.category_id)
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div id={detailsId} className="text-sm text-zinc-300">Рядок {line} · {formatDate(transaction.date)} · {expense ? 'Витрата' : 'Дохід'}</div>
        <p className="font-semibold tabular-nums">
          {expense ? '−' : '+'}{formatKopecks(row.amountUah)}
          {transaction.currency === 'USD' && <span className="ml-2 text-sm font-normal text-zinc-400">{formatBalanceInput(BigInt(transaction.amount_original_kop))} USD</span>}
        </p>
      </div>
      {row.existing ? (
        <p className="break-words text-sm text-zinc-400">
          Уже в обліку{transaction.purchase_name ? ` · ${transaction.purchase_name}` : ''}
        </p>
      ) : (
        <>
          <label className="flex w-fit items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={row.selected} className="size-4 accent-emerald-300"
              aria-label={`Додати рядок ${line}`} aria-describedby={detailsId}
              onChange={(event) => { const selected = event.target.checked; onChange((current) => ({ ...current, selected })) }} />
            Додати
          </label>
          {row.possibleMatch && <p className="text-sm text-amber-200">Можливий збіг за датою і сумою.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="min-w-0 text-sm font-medium">
              {expense ? 'Назва покупки' : 'Назва доходу'}
              <input className={fieldClass} value={transaction.purchase_name ?? ''} onChange={(event) => {
                const purchaseName = event.target.value
                onChange((current) => ({ ...current, transaction: { ...current.transaction, purchase_name: purchaseName } }))
              }} />
            </label>
            <div className="min-w-0">
              <label className="block text-sm font-medium">
                Категорія
                <select className={fieldClass} style={categoryColorStyle(category?.color)} value={transaction.category_id}
                  onChange={(event) => onCategoryChange(event.target.value)}>
                  <option value="">Вибери категорію</option>
                  {categories.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
              <button type="button" className={createButtonClass}
                aria-describedby={detailsId} onClick={onAddCategory}>Додати категорію</button>
            </div>
            {category && (
              <div className="min-w-0">
                <label className="block text-sm font-medium">
                  Підкатегорія
                  <SubcategorySelect id={`csv-subcategory-${line}`} className={fieldClass} categoryId={category.id}
                    subcategories={subcategories} value={getSubcategoryId(transaction.subcategory_id)}
                    onChange={(id) => onChange((current) => ({ ...current, transaction: { ...current.transaction, subcategory_id: id } }))} />
                </label>
                <button type="button" className={createButtonClass}
                  aria-describedby={detailsId} onClick={() => onAddSubcategory(category)}>Додати підкатегорію</button>
              </div>
            )}
          </div>
          {row.categoryName && <p className="break-words text-sm text-zinc-400">Категорія у файлі — {row.categoryName}</p>}
          {row.subcategoryName && <p className="break-words text-sm text-zinc-400">Підкатегорія у файлі — {row.subcategoryName}</p>}
          {transaction.comment && <p className="whitespace-pre-wrap break-words text-sm text-zinc-400">{transaction.comment}</p>}
        </>
      )}
    </>
  )
}
