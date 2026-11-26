import type { SupabaseClient } from '@supabase/supabase-js'
import { getAvailableCategories, type Category, type CategoryType } from '../categories/data'
import { defaultSubcategoryId, type Subcategory } from '../categories/subcategories'
import { isDateOnOrBefore, todayInKyiv } from '../lib/dates'
import { parseHryvnias } from '../lib/money'
import type { TransactionOverlay } from '../offline/snapshot'
import { loadTransactions, type TransactionFields } from '../transactions/data'
import { convertToUah, parseExchangeRate } from '../transactions/exchange'
import { loadTransfers, type QueuedTransfer } from '../transfers/data'
import { csvHash, type CsvFile } from './parse'

export const csvColumns = [
  { key: 'date', label: 'Дата', aliases: ['date', 'дата', 'дата операції', 'дата транзакції', 'transaction date', 'дата і час'], required: true },
  { key: 'amount', label: 'Сума', aliases: ['amount', 'сума', 'сума операції', 'сума в гривнях', 'сума в uah', 'transaction amount'], required: true },
  { key: 'type', label: 'Тип операції', aliases: ['type', 'transaction type', 'тип', 'тип операції', 'тип транзакції'] },
  { key: 'name', label: 'Назва', aliases: ['name', 'title', 'description', 'purchase name', 'назва', 'опис', 'деталі операції', 'призначення платежу'] },
  { key: 'category', label: 'Категорія', aliases: ['category', 'категорія'] },
  { key: 'subcategory', label: 'Підкатегорія', aliases: ['subcategory', 'sub category', 'підкатегорія'] },
  { key: 'comment', label: 'Коментар', aliases: ['comment', 'note', 'коментар', 'примітка'] },
  { key: 'currency', label: 'Валюта', aliases: ['currency', 'валюта', 'валюта операції'] },
  { key: 'rate', label: 'Курс долара', aliases: ['rate', 'exchange rate', 'курс', 'курс долара'] },
  { key: 'reference', label: 'ID операції', aliases: ['id', 'transaction id', 'reference', 'ідентифікатор', 'id операції', 'номер операції'] },
] as const

export type CsvColumn = typeof csvColumns[number]['key']
export type CsvMapping = Partial<Record<CsvColumn, number>>
export type CsvTransaction = TransactionFields & { id: string; user_id: string }
export type CsvRow =
  | { line: number; error: string }
  | { line: number; transaction: CsvTransaction; amountUah: bigint; existing: boolean; possibleMatch: boolean; categoryName: string; subcategoryName: string }

function normalize(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('uk-UA').replace(/\s+/g, ' ')
}

export function matchCsvSubcategory(subcategories: readonly Subcategory[], categoryId: string, name: string) {
  const names = [normalize(name)]
  if (/^'[=+@-]/.test(names[0])) names.push(names[0].slice(1))
  return subcategories.find((subcategory) => subcategory.category_id === categoryId
    && names.includes(normalize(subcategory.name)))?.id ?? defaultSubcategoryId
}

export function detectCsvMapping(headers: string[]): CsvMapping {
  const names = headers.map((header) => normalize(header.replace(/[_-]/g, ' ')))
  const mapping: CsvMapping = {}
  for (const { key, aliases } of csvColumns) {
    const index = names.findIndex((name) => (aliases as readonly string[]).includes(name))
    if (index >= 0) mapping[key] = index
  }
  return mapping
}

function readDate(value: string) {
  const dateOnly = value.replace(/[ T](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return dateOnly
  const dayFirst = /^(\d{1,2})([./])(\d{1,2})\2(\d{4})$/.exec(dateOnly)
  if (!dayFirst) return ''
  const [, day, , month, year] = dayFirst
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function readAmount(value: string) {
  const amount = value.replace(/^−/, '-').replace(/[\u00a0\u202f]/g, ' ')
  if (/^[+-]?\d{1,3}(?: \d{3})+(?:[.,]\d{1,2})?$/.test(amount)) return parseHryvnias(amount.replaceAll(' ', ''))
  if (/^[+-]?\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(amount)) return parseHryvnias(amount.replaceAll('.', ''))
  if (/^[+-]?\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(amount)) return parseHryvnias(amount.replaceAll(',', ''))
  return parseHryvnias(amount)
}

const incomes = ['income', 'credit', 'дохід', 'надходження', 'поповнення']
const expenses = ['expense', 'debit', 'витрата', 'витрати', 'видаток', 'списання']

function readType(value: string, amount: bigint): CategoryType | null {
  if (!value) return amount < 0n ? 'expense' : 'income'
  if (expenses.includes(value)) return 'expense'
  if (incomes.includes(value) && amount > 0n) return 'income'
  return null
}

function readCurrency(value: string) {
  if (['', 'uah', '980', 'грн', 'гривня', '₴'].includes(value)) return 'UAH'
  if (['usd', '840', 'долар', '$'].includes(value)) return 'USD'
  return null
}

function matchKey(date: string, type: CategoryType, amount: bigint | string) {
  return `${date}/${type}/${amount}`
}

export async function prepareCsvImport(client: SupabaseClient, file: CsvFile, mapping: CsvMapping, accountId: string,
  categories: Category[], subcategories: readonly Subcategory[], overlay?: TransactionOverlay,
  pendingTransfers?: readonly QueuedTransfer[]): Promise<CsvRow[]> {
  const { data: { session }, error } = await client.auth.getSession()
  if (error || !session) throw new Error('Сесія завершилася. Увійди знову, щоб імпортувати операції.')
  const signal = new AbortController().signal
  const [transactions, transfers] = await Promise.all([
    loadTransactions(client, signal, 'confirmed', undefined, overlay),
    loadTransfers(client, signal, 'confirmed', undefined, pendingTransfers),
  ])
  const existing = new Set(transactions.map(({ id }) => id))
  const possibleMatches = new Set<string>()
  for (const row of transactions) {
    if (row.account_id === accountId) possibleMatches.add(matchKey(row.date, row.type, row.amount_uah_kop))
  }
  for (const row of transfers) {
    if (row.from_account_id === accountId) possibleMatches.add(matchKey(row.date, 'expense', row.amount_uah_kop))
    if (row.to_account_id === accountId) possibleMatches.add(matchKey(row.date, 'income', row.amount_uah_kop))
  }

  const byType = { income: getAvailableCategories(categories, 'income'), expense: getAvailableCategories(categories, 'expense') }
  const today = todayInKyiv()
  const references = new Set<string>()
  return Promise.all(file.rows.map(async ({ line, cells }, index): Promise<CsvRow> => {
    if (cells.length !== file.headers.length) return { line, error: 'Кількість колонок відрізняється від заголовка.' }
    const get = (column: CsvColumn) => cells[mapping[column] ?? -1]?.trim() ?? ''
    const date = readDate(get('date'))
    if (!isDateOnOrBefore(date)) return { line, error: 'Некоректна дата. Використай ДД.ММ.РРРР або РРРР-ММ-ДД.' }
    if (date > today) return { line, error: 'Дата операції в майбутньому.' }
    const signedAmount = readAmount(get('amount'))
    if (signedAmount === null || signedAmount === 0n) return { line, error: 'Некоректна або нульова сума.' }
    const type = readType(normalize(get('type')), signedAmount)
    if (!type) return { line, error: 'Тип або знак суми не відповідає доходу чи витраті.' }
    const currency = readCurrency(normalize(get('currency')))
    if (!currency) return { line, error: 'Підтримуються гривня (UAH) і долар (USD).' }
    if (mapping.currency !== undefined && !get('currency')) return { line, error: 'У колонці валюти порожнє значення.' }
    const rate = currency === 'UAH' ? '1' : parseExchangeRate(get('rate'))
    if (!rate) return { line, error: 'Для USD вкажи курс у гривнях.' }
    const amount = signedAmount < 0n ? -signedAmount : signedAmount
    const amountUah = convertToUah(amount, rate)
    if (amountUah === null) return { line, error: 'Сума в гривнях завелика.' }
    const categoryName = get('category')
    const category = byType[type].find(({ name }) => normalize(name) === normalize(categoryName))
    const subcategoryName = get('subcategory')
    const subcategoryId = matchCsvSubcategory(subcategories, category?.id ?? '', subcategoryName)
    const reference = get('reference')
    if (reference && references.has(reference)) return { line, error: 'ID операції повторюється в цьому файлі.' }
    if (reference) references.add(reference)

    // Identical payments in separate rows must keep separate IDs.
    const source = reference ? ['reference', reference] : ['file', file.fingerprint, index]
    const userId = session.user.id
    const hash = await csvHash(JSON.stringify(['pef-fin-tr:csv', userId, accountId, ...source]))
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
    const transaction: CsvTransaction = {
      id, user_id: userId, account_id: accountId, category_id: category?.id ?? '', subcategory_id: subcategoryId,
      date, type, status: 'confirmed', currency, rate, amount_original_kop: amount.toString(),
      purchase_name: get('name') || null, comment: get('comment') || null,
    }
    return { line, transaction, amountUah, existing: existing.has(id), possibleMatch: possibleMatches.has(matchKey(date, type, amountUah)), categoryName, subcategoryName }
  }))
}

export async function saveCsvImport(client: SupabaseClient, rows: CsvTransaction[]) {
  const { data, error } = await client.from('transactions')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true }).select('id')
  if (error) throw error
  return data.length
}
