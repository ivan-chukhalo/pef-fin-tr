const databaseMin = -(2n ** 63n)
const databaseMax = 2n ** 63n - 1n

const currencyFormatter = new Intl.NumberFormat('uk-UA', {
  style: 'currency',
  currency: 'UAH',
})
const inputFormatter = new Intl.NumberFormat('uk-UA', {
  useGrouping: false,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function fitsDatabaseKopecks(amount: bigint): boolean {
  return amount >= databaseMin && amount <= databaseMax
}

export function parseHryvnias(value: string): bigint | null {
  const parts = /^([+-]?)(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim())
  if (!parts) return null

  const [, sign, hryvnias, fraction = ''] = parts
  const amount = BigInt(hryvnias) * 100n + BigInt(fraction.padEnd(2, '0'))
  const kopecks = sign === '-' ? -amount : amount

  return fitsDatabaseKopecks(kopecks) ? kopecks : null
}

export function formatKopecks(amount: bigint, formatter = currencyFormatter): string {
  const whole = amount / 100n
  const remainder = amount % 100n
  const fraction = (remainder < 0n ? -remainder : remainder).toString().padStart(2, '0')
  const signedWhole = amount < 0n && whole === 0n ? -0 : whole

  return formatter.formatToParts(signedWhole)
    .map((part) => part.type === 'fraction' ? fraction : part.value)
    .join('')
}

export function formatBalanceInput(amount: bigint): string {
  return formatKopecks(amount, inputFormatter)
}
