import { useState, type FormEvent } from 'react'
import type { Category } from '../categories/data'
import { formatDate } from '../lib/dates'
import { formatBalanceInput, parseHryvnias } from '../lib/money'
import { getBudgetCategories } from './budgets'

const fieldClass = 'mt-1 min-h-11 w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30'
const buttonClass = 'min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-medium hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-50'

export default function CategoryBudgetEditor({ month, categories, budgets, onSave }: {
  month: string
  categories: readonly Category[]
  budgets: ReadonlyMap<string, bigint>
  onSave: (categoryId: string, amount: bigint | null) => Promise<void>
}) {
  const [categoryId, setCategoryId] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ message: string; error?: boolean }>()
  const eligibleCategories = getBudgetCategories(categories, budgets)
  const category = eligibleCategories.find(({ id }) => id === categoryId)
  const activeLimit = category && budgets.get(category.id)
  const start = formatDate(`${month}-01`)

  async function save(amount: bigint | null) {
    if (!category || saving) return
    setSaving(true)
    setNotice(undefined)
    try {
      await onSave(category.id, amount)
      setAmountInput(amount === null ? '' : formatBalanceInput(amount))
      setNotice({ message: amount === null ? `Ліміт вимкнено з ${start}.` : 'Ліміт збережено.' })
    } catch {
      setNotice({ message: 'Не вдалося зберегти ліміт. Спробуй ще раз.', error: true })
    } finally {
      setSaving(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = parseHryvnias(amountInput)
    if (amount === null || amount <= 0n) {
      setNotice({ message: 'Вкажи додатну суму в гривнях із точністю до копійок.', error: true })
      return
    }
    void save(amount)
  }

  return (
    <details className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/30">
      <summary className="cursor-pointer rounded-xl px-3 py-3 text-sm font-medium text-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
        Налаштувати ліміти
      </summary>
      <form onSubmit={submit} className="space-y-3 px-3 pb-3">
        <p className="text-sm text-zinc-400">Ліміт діє з {start} й повторюється, доки ти його не зміниш.</p>
        <fieldset disabled={saving} className="min-w-0 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="min-w-0 text-sm font-medium">
              Категорія витрат
              <select value={categoryId} className={fieldClass} required onChange={(event) => {
                const id = event.target.value
                const limit = budgets.get(id)
                setCategoryId(id)
                setAmountInput(limit === undefined ? '' : formatBalanceInput(limit))
                setNotice(undefined)
              }}>
                <option value="" disabled>Вибери категорію</option>
                {eligibleCategories.map(({ id, name, is_hidden }) => (
                  <option key={id} value={id}>{name}{is_hidden ? ' (приховано)' : ''}</option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-sm font-medium">
              Ліміт у гривнях
              <input value={amountInput} className={fieldClass} inputMode="decimal" required
                onChange={(event) => setAmountInput(event.target.value)} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={buttonClass} disabled={!category}>
              {saving ? 'Зберігаємо…' : 'Зберегти ліміт'}
            </button>
            {activeLimit !== undefined && (
              <button type="button" className={buttonClass} onClick={() => void save(null)}>Вимкнути ліміт</button>
            )}
          </div>
        </fieldset>
        {notice && <p role={notice.error ? 'alert' : 'status'} className={`text-sm ${notice.error ? 'text-rose-300' : 'text-emerald-200'}`}>{notice.message}</p>}
      </form>
    </details>
  )
}
