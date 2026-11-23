import { isCategoryColor } from '../categories/color'

const summaryLabels = {
  accounts: 'Рахунки',
  categories: 'Категорії',
  transactions: 'Транзакції',
  transfers: 'Перекази',
  recurring_templates: 'Шаблони',
} as const

type SummaryKey = keyof typeof summaryLabels
type BackupRow = Record<string, unknown>
export type BackupSummary = Record<SummaryKey, number>
export type BackupVersion = BackupSummary & { id: string; created_at: string }
export type Backup = Record<SummaryKey | 'category_history', BackupRow[]> & {
  format_version: number
  exported_at: string
}

export const summaryKeys = Object.keys(summaryLabels) as SummaryKey[]
export { summaryLabels }

const collections = [...summaryKeys, 'category_history'] as const
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i
const integer = /^-?\d+$/
const decimal = /^\d+(?:\.\d+)?$/

function isRecord(value: unknown): value is BackupRow {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

export function isBackup(value: unknown): value is Backup {
  if (!isRecord(value) || value.format_version !== 1 || !isTimestamp(value.exported_at)) return false

  return collections.every((name) => {
    const rows = value[name]
    return Array.isArray(rows) && rows.every(isRecord)
  })
}

export function isBackupVersion(value: unknown): value is BackupVersion {
  return isRecord(value) && typeof value.id === 'string' && uuid.test(value.id) &&
    isTimestamp(value.created_at) && summaryKeys.every((key) => {
      const count = value[key]
      return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0
    })
}

function keyOf(value: unknown) {
  return typeof value === 'string' && uuid.test(value) ? value.toLowerCase() : ''
}

function indexRows(rows: BackupRow[]) {
  const index = new Map<string, BackupRow>()
  for (const row of rows) {
    const id = keyOf(row.id)
    if (!id || index.has(id)) throw new Error('У копії є некоректні або дубльовані ідентифікатори.')
    index.set(id, row)
  }
  return index
}

function hasNumber(value: unknown, pattern: RegExp) {
  return typeof value === 'string' && pattern.test(value)
}

export function parseBackup(text: string): Backup {
  let file: unknown
  try {
    file = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    throw new Error('Не вдалося прочитати JSON-файл.')
  }

  if (!isRecord(file)) throw new Error('Вибери резервну копію цього застосунку.')
  const backup = {
    ...file,
    recurring_templates: file.recurring_templates === undefined ? [] : file.recurring_templates,
    category_history: file.category_history === undefined ? [] : file.category_history,
  }
  if (!isBackup(backup)) throw new Error('Формат резервної копії не підтримується.')

  // Older PowerShell backups predate operation status and category history.
  backup.transactions = backup.transactions.map((row) => ({ status: 'confirmed', ...row }))
  backup.transfers = backup.transfers.map((row) => ({ status: 'confirmed', ...row }))
  const ids = Object.fromEntries(collections.map((name) => [name, indexRows(backup[name])])) as
    Record<(typeof collections)[number], Map<string, BackupRow>>

  if (backup.categories.some(({ color }) => color != null && !isCategoryColor(color))) {
    throw new Error('У резервній копії є категорія з некоректним кольором.')
  }

  const referencedCategories = new Set<string>()
  for (const row of [...backup.transactions, ...backup.recurring_templates]) {
    const categoryId = keyOf(row.category_id)
    const category = ids.categories.get(categoryId)
    if (!ids.accounts.has(keyOf(row.account_id)) || !category || category.type !== row.type) {
      throw new Error('Транзакція або шаблон посилається на відсутній рахунок чи категорію.')
    }
    referencedCategories.add(categoryId)
  }

  for (const row of backup.transactions) {
    const hasTemplate = row.template_id !== null && row.template_id !== undefined
    const hasOccurrence = row.occurrence_number !== null && row.occurrence_number !== undefined
    if (hasTemplate !== hasOccurrence || (hasTemplate && !ids.recurring_templates.has(keyOf(row.template_id)))) {
      throw new Error('У копії є транзакція з некоректним посиланням на шаблон.')
    }
  }

  for (const row of backup.transfers) {
    const from = keyOf(row.from_account_id)
    const to = keyOf(row.to_account_id)
    if (!ids.accounts.has(from) || !ids.accounts.has(to) || from === to) {
      throw new Error('У копії є переказ із некоректними рахунками.')
    }
  }

  if (file.category_history === undefined) {
    backup.category_history = [...referencedCategories].map((id) => ({ id, state: 'used' }))
  } else {
    const invalidHistory = backup.category_history.some((row) => {
      const exists = ids.categories.has(keyOf(row.id))
      return row.state === 'used' ? !exists : row.state !== 'deleted' || exists
    })
    if (invalidHistory || [...referencedCategories].some((id) => ids.category_history.get(id)?.state !== 'used')) {
      throw new Error('Історія категорій у копії не збігається із записами.')
    }
  }

  const validStatus = (row: BackupRow) => row.status === 'planned' || row.status === 'confirmed'
  if (!backup.transactions.every(validStatus) || !backup.transfers.every(validStatus)) {
    throw new Error('У копії є операція з невідомим статусом.')
  }
  if (!backup.accounts.every((row) => hasNumber(row.initial_balance_kop, integer)) ||
      !backup.transactions.every((row) => hasNumber(row.amount_uah_kop, integer)) ||
      !backup.transfers.every((row) => hasNumber(row.amount_uah_kop, integer)) ||
      ![...backup.transactions, ...backup.recurring_templates].every((row) =>
        hasNumber(row.amount_original_kop, integer) && hasNumber(row.rate, decimal))) {
    throw new Error('Суми та курси в копії мають бути збережені як текстові числа.')
  }

  return backup
}
