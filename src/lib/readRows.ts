import type { SupabaseClient } from '@supabase/supabase-js'

export async function readRows<Row extends { id: string }>(
  client: SupabaseClient,
  table: string,
  columns: string,
  signal?: AbortSignal,
): Promise<Row[]> {
  const rows: Row[] = []
  let lastId: string | undefined

  for (;;) {
    const query = client.from(table)
      .select(columns, lastId ? undefined : { count: 'exact' })
      .order('id')
      .limit(500)
    if (signal) query.abortSignal(signal)
    if (lastId) query.gt('id', lastId)

    const { data, error, count } = await query.overrideTypes<Row[], { merge: false }>()
    if (error) throw error
    if (!data?.length) return rows

    rows.push(...data)
    if (count === rows.length) return rows

    lastId = data[data.length - 1].id
  }
}
