import { useState, type FormEvent } from 'react'
import DateInput from '../lib/DateInput'
import { isDateOnOrBefore } from '../lib/dates'
import { getAnalyticsPeriodError, type AnalyticsPeriod } from './data'

export default function AnalyticsPeriodForm({ period, today, fieldClass, onApply }: {
  period: AnalyticsPeriod
  today: string
  fieldClass: string
  onApply: (period: AnalyticsPeriod) => void
}) {
  const [error, setError] = useState(() => getAnalyticsPeriodError(period, today))

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const next = { from: String(fields.get('from') ?? ''), to: String(fields.get('to') ?? '') }
    const message = getAnalyticsPeriodError(next, today)
    setError(message)
    if (!message) onApply(next)
  }

  return (
    <form onSubmit={apply} aria-label="Власний період" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-md">
        <div className="grid min-w-0 gap-2 text-sm font-medium">
          <label htmlFor="analytics-from">Початок періоду</label>
          <DateInput id="analytics-from" name="from" className={fieldClass} max={today}
            defaultValue={isDateOnOrBefore(period.from) ? period.from : ''} required
            aria-invalid={error ? true : undefined} aria-describedby={error ? 'analytics-date-error' : undefined} />
        </div>
        <div className="grid min-w-0 gap-2 text-sm font-medium">
          <label htmlFor="analytics-to">Кінець періоду</label>
          <DateInput id="analytics-to" name="to" className={fieldClass} max={today}
            defaultValue={isDateOnOrBefore(period.to) ? period.to : ''} required
            aria-invalid={error ? true : undefined} aria-describedby={error ? 'analytics-date-error' : undefined} />
        </div>
      </div>
      {error && <p id="analytics-date-error" role="alert" className="text-sm text-rose-300">{error}</p>}
      <button type="submit" className="min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
        Застосувати
      </button>
    </form>
  )
}
