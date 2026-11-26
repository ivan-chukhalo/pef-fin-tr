import type { SupabaseClient } from '@supabase/supabase-js'
import { readRows } from '../lib/readRows'
import type { OfflineSnapshot } from '../offline/snapshot'
import type { Category } from './data'
import type { Subcategory } from './subcategories'

const columns = 'id,category_id,category_type,name,is_hidden'

export async function loadSubcategories(client: SupabaseClient, signal: AbortSignal, snapshot?: OfflineSnapshot) {
  if (snapshot) return snapshot.subcategories ?? []
  try {
    return await readRows<Subcategory>(client, 'subcategories', columns, signal)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'PGRST205') return null
    throw error
  }
}

export async function saveSubcategory(client: SupabaseClient, id: string, name: string, newCategory?: Category) {
  const table = client.from('subcategories')
  const query = newCategory
    ? table.upsert({ id, category_id: newCategory.id, category_type: newCategory.type, name }, { onConflict: 'id' })
    : table.update({ name }).eq('id', id)
  const { data, error } = await query.select(columns).single().overrideTypes<Subcategory, { merge: false }>()
  if (error) throw error
  return data
}

export async function setSubcategoryHidden(client: SupabaseClient, id: string, isHidden: boolean) {
  const { data, error } = await client.from('subcategories').update({ is_hidden: isHidden })
    .eq('id', id).select(columns).single().overrideTypes<Subcategory, { merge: false }>()
  if (error) throw error
  return data
}
