import { isDateOnOrBefore, nextCalendarDate, todayInKyiv } from '../lib/dates.ts'

export type StatementPeriod = { from: string; to: string }

const secondsPerDay = 86_400
const millisecondsPerDay = secondsPerDay * 1000
const bankLimitSeconds = 31 * secondsPerDay + 3600
export const statementMaxDays = 31
export const earliestStatementDate = '1970-01-01'

export function defaultStatementPeriod(today = todayInKyiv()): StatementPeriod {
  const start = Date.parse(`${today}T00:00:00Z`) - 29 * millisecondsPerDay
  return { from: new Date(start).toISOString().slice(0, 10), to: today }
}

export function getStatementPeriodError({ from, to }: StatementPeriod, today = todayInKyiv()): string {
  if (from < earliestStatementDate || !isDateOnOrBefore(from, today) || !isDateOnOrBefore(to, today)) {
    return 'Вибери коректні дати без майбутніх днів.'
  }
  if (to < from) return 'Дата закінчення має бути в той самий день або пізніше.'
  const days = (Date.parse(to) - Date.parse(from)) / millisecondsPerDay + 1
  return days > statementMaxDays ? `Період виписки має бути до ${statementMaxDays} дня включно.` : ''
}

function startOfKyivDay(date: string): number {
  const midnightUtc = Date.parse(date) / 1000
  let before = midnightUtc - secondsPerDay
  let atOrAfter = midnightUtc + secondsPerDay

  // Find the local date boundary without assuming a fixed UTC offset.
  while (atOrAfter - before > 1) {
    const middle = Math.floor((before + atOrAfter) / 2)
    if (todayInKyiv(new Date(middle * 1000)) < date) before = middle
    else atOrAfter = middle
  }
  return atOrAfter
}

export function getStatementInterval(period: StatementPeriod, now = new Date()) {
  if (getStatementPeriodError(period, todayInKyiv(now))) return null
  const from = Math.max(0, startOfKyivDay(period.from))
  const endExclusive = startOfKyivDay(nextCalendarDate(period.to))
  const to = Math.min(Math.floor(now.getTime() / 1000), endExclusive)
  return to >= from && to - from <= bankLimitSeconds ? { from, to, endExclusive } : null
}
