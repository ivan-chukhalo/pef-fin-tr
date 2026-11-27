import type { SupabaseClient } from '@supabase/supabase-js'
import { readRows } from '../lib/readRows'
import type { OfflineSnapshot } from '../offline/snapshot'
import type { TransactionFields } from '../transactions/data'

export const recurringPath = '/transactions/recurring'
export const recurringFrequencies = {
  weekly: { label: 'Щотижня', months: null },
  monthly: { label: 'Щомісяця', months: 1 },
  every_two_months: { label: 'Що два місяці', months: 2 },
  quarterly: { label: 'Щоквартально', months: 3 },
  semiannual: { label: 'Щопівроку', months: 6 },
  yearly: { label: 'Щороку', months: 12 },
} as const

type RecurringFrequency = keyof typeof recurringFrequencies

export function isRecurringFrequency(value: unknown): value is RecurringFrequency {
  return typeof value === 'string' && Object.hasOwn(recurringFrequencies, value)
}

export type RecurringSchedule = {
  frequency: RecurringFrequency
  start_date: string
  occurrences: number
}

export function scheduleFitsCalendar(date: string, frequency: RecurringFrequency, occurrences: number) {
  const last = new Date(`${date}T00:00:00Z`)
  const repeats = occurrences - 1
  const months = recurringFrequencies[frequency].months
  if (months === null) last.setUTCDate(last.getUTCDate() + repeats * 7)
  else {
    last.setUTCDate(1)
    last.setUTCMonth(last.getUTCMonth() + repeats * months)
  }
  return last.getUTCFullYear() <= 9999
}

export type RecurringTemplateFields = Omit<TransactionFields, 'date' | 'status'> & RecurringSchedule
export type RecurringTemplate = RecurringTemplateFields & { id: string }

const columns = 'id,account_id,category_id,subcategory_id,type,currency,amount_original_kop::text,rate::text,purchase_name,comment,frequency,start_date,occurrences'
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
