import type { SupabaseClient } from '@supabase/supabase-js'

export type AccountType = 'card' | 'cash'

export type Account = {
  id: string
  name: string
  type: AccountType
  initial_balance_kop: string
  is_hidden: boolean
  created_at: string
}

export type AccountFields = Pick<Account, 'name' | 'type' | 'initial_balance_kop'>

type TransactionAmount = {
  id: string
  account_id: string
  type: 'income' | 'expense'
  amount_uah_kop: string
}

type TransferAmount = {
  id: string
  from_account_id: string
  to_account_id: string
  amount_uah_kop: string
}

export type AccountOverview = {
  accounts: Account[]
  changesByAccount: Map<string, bigint>
}

const accountColumns = 'id,name,type,initial_balance_kop::text,is_hidden,created_at'

async function readRows<Row extends { id: string }>(
  client: SupabaseClient,
  table: 'accounts' | 'transactions' | 'transfers',
  columns: string,
  signal: AbortSignal,
): Promise<Row[]> {
  const rows: Row[] = []
  let lastId: string | undefined

  for (;;) {
    const query = client.from(table)
      .select(columns, lastId ? undefined : { count: 'exact' })
      .order('id')
      .limit(500)
      .abortSignal(signal)
    if (lastId) query.gt('id', lastId)

    const { data, error, count } = await query.overrideTypes<Row[], { merge: false }>()
    if (error) throw error
    if (!data?.length) return rows

    rows.push(...data)
    if (count === rows.length) return rows

    lastId = data[data.length - 1].id
  }
}

export async function loadAccountOverview(
  client: SupabaseClient,
  signal: AbortSignal,
): Promise<AccountOverview> {
  const [accounts, transactions, transfers] = await Promise.all([
    readRows<Account>(client, 'accounts', accountColumns, signal),
    readRows<TransactionAmount>(client, 'transactions', 'id,account_id,type,amount_uah_kop::text', signal),
    readRows<TransferAmount>(client, 'transfers', 'id,from_account_id,to_account_id,amount_uah_kop::text', signal),
  ])
  const changesByAccount = new Map<string, bigint>()

  function addChange(accountId: string, amount: bigint) {
    changesByAccount.set(accountId, (changesByAccount.get(accountId) ?? 0n) + amount)
  }

  for (const transaction of transactions) {
    const amount = BigInt(transaction.amount_uah_kop)
    addChange(transaction.account_id, transaction.type === 'income' ? amount : -amount)
  }

  for (const transfer of transfers) {
    const amount = BigInt(transfer.amount_uah_kop)
    addChange(transfer.from_account_id, -amount)
    addChange(transfer.to_account_id, amount)
  }

  return { accounts, changesByAccount }
}

export async function saveAccount(
  client: SupabaseClient,
  id: string,
  fields: AccountFields,
  isNew: boolean,
): Promise<Account> {
  const table = client.from('accounts')
  const query = isNew
    ? table.upsert({ id, ...fields }, { onConflict: 'id' })
    : table.update(fields).eq('id', id)

  const { data, error } = await query.select(accountColumns).single().overrideTypes<Account, { merge: false }>()
  if (error) throw error
  return data
}

export async function setAccountHidden(
  client: SupabaseClient,
  id: string,
  isHidden: boolean,
): Promise<Account> {
  const { data, error } = await client.from('accounts')
    .update({ is_hidden: isHidden })
    .eq('id', id)
    .select(accountColumns)
    .single()
    .overrideTypes<Account, { merge: false }>()

  if (error) throw error
  return data
}
