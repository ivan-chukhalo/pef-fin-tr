const kyivDate = new Intl.DateTimeFormat('uk-UA', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const dayFormatter = new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeZone: 'UTC' })
const monthFormatter = new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export function todayInKyiv(now = new Date()): string {
  const parts = Object.fromEntries(kyivDate.formatToParts(now).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function isDateOnOrBefore(value: string, latest: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000') || value > latest) return false

  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function formatDate(value: string): string {
  return dayFormatter.format(new Date(`${value}T00:00:00Z`))
}

export function formatMonth(value: string): string {
  return monthFormatter.format(new Date(`${value}-01T00:00:00Z`))
}
