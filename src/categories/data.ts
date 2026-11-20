import type { SupabaseClient } from '@supabase/supabase-js'
import { readRows } from '../lib/readRows'

export type CategoryType = 'income' | 'expense'

export type Category = {
  id: string
  name: string
  type: CategoryType
  is_hidden: boolean
}

const columns = 'id,name,type,is_hidden'
const categoryOrder = new Intl.Collator('uk-UA')

const defaults = [
  { key: 'salary', name: 'Зарплата', type: 'income' },
  { key: 'side-work', name: 'Підробіток', type: 'income' },
  { key: 'gifts', name: 'Подарунки', type: 'income' },
  { key: 'other-income', name: 'Інші доходи', type: 'income' },
  { key: 'groceries', name: 'Продукти', type: 'expense' },
  { key: 'dining', name: 'Кафе й ресторани', type: 'expense' },
  { key: 'transport', name: 'Транспорт', type: 'expense' },
  { key: 'housing', name: 'Житло й комунальні послуги', type: 'expense' },
  { key: 'health', name: 'Здоров’я', type: 'expense' },
  { key: 'entertainment', name: 'Розваги', type: 'expense' },
  { key: 'subscriptions', name: 'Підписки', type: 'expense' },
  { key: 'other-expenses', name: 'Інші витрати', type: 'expense' },
] as const

export function getAvailableCategories(categories: readonly Category[], type: CategoryType): Category[] {
  return categories
    .filter((category) => category.type === type && !category.is_hidden)
    .sort((first, second) => categoryOrder.compare(first.name, second.name) || first.id.localeCompare(second.id))
}

export async function saveCategory(
  client: SupabaseClient,
  id: string,
  name: string,
  newCategoryType?: CategoryType,
): Promise<Category> {
  const table = client.from('categories')
  const query = newCategoryType
    ? table.upsert({ id, name, type: newCategoryType }, { onConflict: 'id' })
    : table.update({ name }).eq('id', id)

  const { data, error } = await query.select(columns).single().overrideTypes<Category, { merge: false }>()
  if (error) throw error
  return data
}

export async function setCategoryHidden(client: SupabaseClient, id: string, isHidden: boolean): Promise<Category> {
  const { data, error } = await client.from('categories')
    .update({ is_hidden: isHidden })
    .eq('id', id)
    .select(columns)
    .single()
    .overrideTypes<Category, { merge: false }>()

  if (error) throw error
  return data
}

async function defaultCategoryId(userId: string, key: string): Promise<string> {
  // Keep the UUID stable per owner and template so retrying never replaces that category.
  const input = new TextEncoder().encode(`pef-fin-tr:category:${userId}:${key}`)
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', input)).subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x80
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function loadCategories(client: SupabaseClient, signal?: AbortSignal): Promise<Category[]> {
  const [{ data: { user }, error: userError }, categories] = await Promise.all([
    client.auth.getUser(),
    readRows<Category>(client, 'categories', columns, signal),
  ])
  if (userError || !user) throw userError ?? new Error('Session unavailable')

  const existingIds = new Set(categories.map(({ id }) => id))
  const existingNames = new Set(categories.map(({ type, name }) => `${type}:${name.trim().toLocaleLowerCase('uk-UA')}`))
  const rows = await Promise.all(defaults.map(async ({ key, name, type }) => ({
    id: await defaultCategoryId(user.id, key),
    name,
    type,
  })))
  const missing = rows.filter(({ id, name, type }) =>
    !existingIds.has(id) && !existingNames.has(`${type}:${name.toLocaleLowerCase('uk-UA')}`),
  )

  if (!missing.length) return categories

  signal?.throwIfAborted()
  const query = client.from('categories')
    .upsert(missing, { onConflict: 'id', ignoreDuplicates: true })
  if (signal) query.abortSignal(signal)

  const { error } = await query
  if (error) throw error

  return readRows<Category>(client, 'categories', columns, signal)
}
