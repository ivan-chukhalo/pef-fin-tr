import type { SupabaseClient } from '@supabase/supabase-js'
import { readRows } from '../lib/readRows'
import type { OfflineSnapshot } from '../offline/snapshot'
import type { TransactionFields } from '../transactions/data'

export const recurringPath = '/transactions/recurring'
export const frequencyLabels = { weekly: 'Щотижня', monthly: 'Щомісяця' }

export type RecurringSchedule = {
  frequency: keyof typeof frequencyLabels
  start_date: string
  occurrences: number
}

export type RecurringTemplateFields = Omit<TransactionFields, 'date' | 'status'> & RecurringSchedule
export type RecurringTemplate = RecurringTemplateFields & { id: string }

const columns = 'id,account_id,category_id,type,currency,amount_original_kop::text,rate::text,purchase_name,comment,frequency,start_date,occurrences'
const tableName = 'recurring_templates'

export function loadRecurringTemplates(client: SupabaseClient, signal: AbortSignal, snapshot?: OfflineSnapshot) {
  if (snapshot) return Promise.resolve([...snapshot.recurring_templates])
  return readRows<RecurringTemplate>(client, tableName, columns, signal)
}

export async function loadRecurringTemplate(client: SupabaseClient, id: string, signal: AbortSignal) {
  const { data, error } = await client.from(tableName).select(columns)
    .eq('id', id).abortSignal(signal).maybeSingle().overrideTypes<RecurringTemplate, { merge: false }>()
  if (error) throw error
  return data
}

export async function saveRecurringTemplate(client: SupabaseClient, id: string, fields: RecurringTemplateFields, isNew: boolean) {
  const table = client.from(tableName)
  const query = isNew ? table.upsert({ id, ...fields }, { onConflict: 'id' }) : table.update(fields).eq('id', id)
  const { error } = await query.select('id').single()
  if (error) throw error
}

export async function deleteRecurringTemplate(client: SupabaseClient, id: string) {
  const { error } = await client.from(tableName).delete().eq('id', id)
  if (error) throw error
}
