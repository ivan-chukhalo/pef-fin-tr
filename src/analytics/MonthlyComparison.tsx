import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMonth } from '../lib/dates'
import { formatKopecks } from '../lib/money'

type Month = { month: string; income: bigint; expense: bigint }

const incomeColor = '#6ee7b7'
const expenseColor = '#7dd3fc'
const shortMonth = new Intl.DateTimeFormat('uk-UA', { month: 'short', timeZone: 'UTC' })
const axisAmount = new Intl.NumberFormat('uk-UA', { notation: 'compact', maximumFractionDigits: 2 })

export default function MonthlyComparison({ months }: { months: Month[] }) {
  const data = months.map(({ month, income, expense }) => ({ month, income: Number(income) / 100, expense: Number(expense) / 100 }))
  const longTimeline = months.length > 6
  const showYear = months[0]?.month.slice(0, 4) !== months.at(-1)?.month.slice(0, 4)

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-zinc-300">
        <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ backgroundColor: incomeColor }} />Доходи</span>
        <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ backgroundColor: expenseColor }} />Витрати</span>
      </div>
      <div className="mt-4 min-w-0 overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-300"
        role={longTimeline ? 'region' : undefined} aria-label={longTimeline ? 'Графік доходів і витрат' : undefined} tabIndex={longTimeline ? 0 : undefined}>
        <div className="h-60 w-full sm:h-72" style={longTimeline ? { minWidth: months.length * 64 + 56 } : undefined}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} accessibilityLayer barGap={3} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#3f3f46" strokeDasharray="3 4" />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                interval={0}
                tick={{ fill: '#a1a1aa', fontSize: 11 }}
                tickFormatter={(month: string) => {
                  const label = shortMonth.format(new Date(`${month}-01T00:00:00Z`))
                  return showYear ? `${label} ${month.slice(2, 4)}` : label
                }}
              />
              <YAxis width={52} tickCount={5} axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 12 }} tickFormatter={(amount: number) => axisAmount.format(amount)} />
              <Tooltip
                cursor={{ fill: '#27272a', opacity: 0.65 }}
                content={({ active, label }) => {
                  const values = active && months.find(({ month }) => month === label)
                  return values ? (
                    <div className="space-y-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 shadow-lg">
                      <p className="font-semibold">{formatMonth(values.month)}</p>
                      <p>Доходи {formatKopecks(values.income)}</p>
                      <p>Витрати {formatKopecks(values.expense)}</p>
                    </div>
                  ) : null
                }}
              />
              <Bar name="Доходи" dataKey="income" fill={incomeColor} radius={[3, 3, 0, 0]} maxBarSize={30} isAnimationActive={false} />
              <Bar name="Витрати" dataKey="expense" fill={expenseColor} radius={[3, 3, 0, 0]} maxBarSize={30} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <details className="mt-3 border-t border-zinc-800 pt-2">
        <summary className="min-h-11 cursor-pointer rounded-sm py-3 text-sm text-zinc-300 focus-visible:outline-2 focus-visible:outline-emerald-300">Суми за місяцями</summary>
        <table aria-label="Доходи й витрати за місяцями" className="w-full table-fixed border-collapse text-sm">
          <thead className="text-zinc-400">
            <tr>
              <th scope="col" className="py-2 text-left font-medium">Місяць</th>
              <th scope="col" className="py-2 text-right font-medium">Доходи</th>
              <th scope="col" className="py-2 text-right font-medium">Витрати</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {months.map(({ month, income, expense }) => (
              <tr key={month}>
                <th scope="row" className="py-2 pr-1 text-left font-medium [overflow-wrap:anywhere]">{formatMonth(month)}</th>
                <td className="py-2 pl-1 text-right tabular-nums [overflow-wrap:anywhere]">{formatKopecks(income)}</td>
                <td className="py-2 pl-1 text-right tabular-nums [overflow-wrap:anywhere]">{formatKopecks(expense)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  )
}
