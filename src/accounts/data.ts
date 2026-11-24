import type { SupabaseClient } from '@supabase/supabase-js'
import { readRows } from '../lib/readRows'
import { mergePendingTransactions, type OfflineSnapshot, type TransactionOverlay } from '../offline/snapshot'

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

export function getAccountBalance(account: Account, changesByAccount: ReadonlyMap<string, bigint>): bigint {
  return BigInt(account.initial_balance_kop) + (changesByAccount.get(account.id) ?? 0n)
}

const accountColumns = 'id,name,type,initial_balance_kop::text,is_hidden,created_at'

export function loadAccounts(client: SupabaseClient, signal?: AbortSignal, snapshot?: OfflineSnapshot): Promise<Account[]> {
  if (snapshot) return Promise.resolve(snapshot.accounts)
  return readRows<Account>(client, 'accounts', accountColumns, signal)
}

export function loadTransferAmounts(client: SupabaseClient, signal: AbortSignal, snapshot?: OfflineSnapshot): Promise<TransferAmount[]> {
  if (snapshot) return Promise.resolve(snapshot.transfers.filter(({ status }) => status === 'confirmed'))
  return readRows<TransferAmount>(client, 'transfers', 'id,from_account_id,to_account_id,amount_uah_kop::text', signal, ['status', 'confirmed'])
}

export function getAccountBalanceChanges(transactions: readonly TransactionAmount[], transfers: readonly TransferAmount[]): Map<string, bigint> {
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

  return changesByAccount
}

export async function loadAccountOverview(
  client: SupabaseClient,
  signal: AbortSignal,
  snapshot?: OfflineSnapshot,
  overlay?: TransactionOverlay,
): Promise<AccountOverview> {
  const [accounts, transactions, transfers] = await Promise.all([
    loadAccounts(client, signal, snapshot),
    snapshot ? snapshot.transactions.filter(({ status }) => status === 'confirmed')
      : readRows<TransactionAmount>(client, 'transactions', 'id,account_id,type,amount_uah_kop::text', signal, ['status', 'confirmed']),
    loadTransferAmounts(client, signal, snapshot),
  ])

  return { accounts, changesByAccount: getAccountBalanceChanges(mergePendingTransactions(transactions, overlay), transfers) }
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
