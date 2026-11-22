export type MonobankAccount = {
  id: string
  label: string
  balanceKop: string
}

export type MonobankEntry = {
  id: string
  time: number
  description: string
  amountKop: string
  originalAmount: string
  currencyCode: number
  mcc: number
}
