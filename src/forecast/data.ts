import type { SupabaseClient } from '@supabase/supabase-js'
import { getAccountBalanceChanges, getTotalAccountBalance } from '../accounts/data'
import { isOverdueOperation } from '../lib/operations'
import type { OfflineSnapshot, TransactionOverlay } from '../offline/snapshot'
import { loadTransactionOptions, loadTransactions, type Transaction } from '../transactions/data'
import { loadTransfers, type QueuedTransfer, type QueuedTransferChange } from '../transfers/data'

export async function loadForecastData(client: SupabaseClient, signal: AbortSignal, snapshot?: OfflineSnapshot, overlay?: TransactionOverlay,
  pendingTransfers?: readonly QueuedTransfer[], transferChanges?: readonly QueuedTransferChange[]) {
  const [options, transactions, transfers] = await Promise.all([
    loadTransactionOptions(client, signal, snapshot),
    loadTransactions(client, signal, 'all', snapshot, overlay),
    loadTransfers(client, signal, 'all', snapshot, pendingTransfers, transferChanges),
  ])
  return { ...options, transactions, transfers }
}

export type ForecastData = Awaited<ReturnType<typeof loadForecastData>>

export function getForecast(data: ForecastData, today: string, date: string) {
  function throughDate(operation: Pick<Transaction, 'date' | 'status'>) {
    return operation.date <= (operation.status === 'confirmed' ? today : date)
  }

  function inPeriod(operation: Pick<Transaction, 'date'>) {
    return operation.date >= today
  }

  function pastDue(operation: Pick<Transaction, 'date' | 'status'>) {
    return isOverdueOperation(operation, today)
  }

  const transactions = data.transactions.filter(throughDate)
  const transfers = data.transfers.filter(throughDate)
  const changesByAccount = getAccountBalanceChanges(transactions, transfers)
  const currentChanges = getAccountBalanceChanges(
    transactions.filter(({ status }) => status === 'confirmed'),
    transfers.filter(({ status }) => status === 'confirmed'),
  )

  return {
    changesByAccount,
    currentBalance: getTotalAccountBalance(data.accounts, currentChanges),
    forecastBalance: getTotalAccountBalance(data.accounts, changesByAccount),
    periodTransactions: transactions.filter(inPeriod),
    periodTransfers: transfers.filter(inPeriod),
    overdueTransactions: transactions.filter(pastDue),
    overdueTransfers: transfers.filter(pastDue),
  }
}
