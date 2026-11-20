import { fitsDatabaseKopecks } from '../lib/money'

export function parseExchangeRate(value: string): string | null {
  const match = /^\+?(\d+)(?:[.,](\d+))?$/.exec(value.trim())
  if (!match) return null

  const whole = match[1].replace(/^0+(?=\d)/, '')
  const fraction = (match[2] ?? '').replace(/0+$/, '')
  if (whole.length > 19 || fraction.length > 16383 || (whole === '0' && !fraction)) return null

  return fraction ? `${whole}.${fraction}` : whole
}

export function convertToUah(amount: bigint, rate: string): bigint | null {
  const [whole, fraction = ''] = rate.split('.')
  const scale = 10n ** BigInt(fraction.length)
  // PostgreSQL round(numeric) rounds a positive half away from zero.
  const kopecks = (amount * BigInt(whole + fraction) + scale / 2n) / scale
  return fitsDatabaseKopecks(kopecks) ? kopecks : null
}
