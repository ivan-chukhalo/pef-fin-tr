import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { Category } from '../categories/data'
import { formatMonth } from '../lib/dates'
import { formatBalanceInput, parseHryvnias } from '../lib/money'
import { getBudgetCategories, type CategoryBudgetDraft } from './budgets'

export default function MonthlyBudgetReview({ month, categories, previous, onConfirm }: {
  month: string
  categories: readonly Category[]
  previous: ReadonlyMap<string, bigint>
  onConfirm: (draft: readonly CategoryBudgetDraft[]) => Promise<void>
}) {
  const [edits, setEdits] = useState(new Map<string, string>())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const options = getBudgetCategories(categories, previous)

  function valueFor(id: string) {
    const limit = previous.get(id)
    return edits.get(id) ?? (limit === undefined ? '' : formatBalanceInput(limit))
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !options.length) return
    const draft: CategoryBudgetDraft[] = []
    for (const category of options) {
      const value = valueFor(category.id).trim()
      const amount = parseHryvnias(value)
      if (value && (amount === null || amount <= 0n)) {
        setError(`Вкажи додатний ліміт для категорії «${category.name}» або залиш поле порожнім.`)
        return
      }
      draft.push({ categoryId: category.id, amount })
    }

    setSaving(true)
    setError('')
    try {
      await onConfirm(draft)
    } catch {
      setError('Не вдалося підтвердити ліміти. Спробуй ще раз.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="budget-review" className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
      <h2 id="budget-review" className="font-semibold">Підтвердити ліміти на {formatMonth(month)}</h2>
      {options.length ? (
        <form className="space-y-3" onSubmit={(event) => void confirm(event)}>
          <p className="text-sm text-zinc-400">
            {previous.size ? 'Ми підставили ліміти попереднього місяця. ' : ''}Вкажи суми в гривнях. Порожнє поле залишає категорію без ліміту.
          </p>
          <fieldset disabled={saving} className="grid min-w-0 gap-3 sm:grid-cols-2">
            {options.map(({ id, name, is_hidden }) => (
              <label key={id} className="grid min-w-0 gap-1 text-sm font-medium [overflow-wrap:anywhere]">
                {name}{is_hidden ? ' (приховано)' : ''}
                <input value={valueFor(id)} inputMode="decimal" placeholder="Без ліміту"
                  onChange={(event) => {
                    const value = event.target.value
                    setEdits((current) => new Map(current).set(id, value))
                  }}
                  className="min-h-11 w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30" />
              </label>
            ))}
            <button type="submit" className="min-h-11 w-fit rounded-xl bg-emerald-300 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60 sm:col-span-2">
              {saving ? 'Зберігаємо…' : 'Підтвердити ліміти'}
            </button>
          </fieldset>
          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        </form>
      ) : <Link to="/more/categories" className="inline-flex min-h-11 items-center text-sm text-emerald-200 underline">Додати категорію витрат</Link>}
    </section>
  )
}
