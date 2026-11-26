import { formatKopecks } from '../lib/money'
import { getBudgetUsage } from './budgets'

export default function CategoryBudgetProgress({ spent, limit }: { spent: bigint; limit: bigint }) {
  const { remaining, percent, barWidth } = getBudgetUsage(spent, limit)
  const exceeded = remaining < 0n
  return (
    <span className="mt-2 block space-y-1 text-xs tabular-nums">
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-zinc-300">
        <span>План {formatKopecks(limit)}</span>
        <span>Використано {percent}</span>
      </span>
      <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <span className={`block h-full rounded-full ${exceeded ? 'bg-rose-400' : 'bg-emerald-300/80'}`} style={{ width: `${barWidth}%` }} />
      </span>
      <span className={`block ${exceeded ? 'font-semibold text-rose-300' : 'text-zinc-400'}`}>
        {exceeded ? `Перевищено на ${formatKopecks(-remaining)}` : `Залишилося ${formatKopecks(remaining)}`}
      </span>
    </span>
  )
}
