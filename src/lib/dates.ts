const kyivDate = new Intl.DateTimeFormat('uk-UA', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const kyivTime = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const monthFormatter = new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export function todayInKyiv(now = new Date()): string {
  const parts = Object.fromEntries(kyivDate.formatToParts(now).map(({ type, value }) => [type, value]))
  return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`
}

export function isDateOnOrBefore(value: string, latest = '9999-12-31'): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000') || value > latest) return false

  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function nextCalendarDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export function formatDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}.${month}.${year}`
}

export function formatDateTimeInKyiv(value: string): string {
  const date = new Date(value)
  return `${formatDate(todayInKyiv(date))}, ${kyivTime.format(date)}`
}

export function formatMonth(value: string): string {
  return monthFormatter.format(new Date(`${value}-01T00:00:00Z`))
}
