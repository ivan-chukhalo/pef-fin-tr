import { formatDate } from '../lib/dates'
import { formatKopecks } from '../lib/money'

function formatChangePercent(change: bigint, current: bigint) {
  if (current === 0n) return null
  const baseline = current < 0n ? -current : current
  const magnitude = change < 0n ? -change : change
  const tenths = (magnitude * 1_000n + baseline / 2n) / baseline
  const whole = (tenths / 10n).toLocaleString('uk-UA')
  const fraction = tenths % 10n
  const sign = change < 0n ? '−' : change > 0n ? '+' : ''
  return `${sign}${whole}${fraction ? `,${fraction}` : ''}%`
}

const amountClass = 'mt-1 font-semibold tabular-nums [overflow-wrap:anywhere]'

export default function ForecastBalanceSummary({ current, forecast, date, includesHidden }: {
  current: bigint
  forecast: bigint
  date: string
  includesHidden: boolean
}) {
  const change = forecast - current
  const percent = formatChangePercent(change, current)
  const changeColor = change > 0n ? 'text-emerald-200' : change < 0n ? 'text-rose-300' : ''

  return (
    <section aria-labelledby="forecast-summary" className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
      <h2 id="forecast-summary" className="text-lg font-semibold">Загальний баланс</h2>
      <dl className="mt-3 grid gap-4 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-sm text-zinc-400">Зараз</dt>
          <dd className={`${amountClass} text-xl ${current < 0n ? 'text-rose-300' : ''}`}>{formatKopecks(current)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-zinc-400">На <time dateTime={date}>{formatDate(date)}</time></dt>
          <dd className={`${amountClass} text-xl ${forecast < 0n ? 'text-rose-300' : ''}`}>{formatKopecks(forecast)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-zinc-400">Зміна</dt>
          <dd className={`${amountClass} flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xl ${changeColor}`}>
            <span>{change > 0n ? '+' : ''}{formatKopecks(change)}</span>
            {percent && <span className="text-sm">({percent})</span>}
          </dd>
        </div>
      </dl>
      {current <= 0n && (
        <p className="mt-3 text-sm text-zinc-400">
          {current === 0n ? 'За нульового поточного балансу зміна показана у гривнях.'
            : 'Відсоток розраховано від абсолютної суми поточного балансу.'}
        </p>
      )}
      {includesHidden && <p className="mt-2 text-sm text-zinc-400">Включно з прихованими рахунками.</p>}
    </section>
  )
}
