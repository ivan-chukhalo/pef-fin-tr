import type { SupabaseClient } from '@supabase/supabase-js'
import { useState, type FormEvent } from 'react'
import { canReachSupabase } from '../lib/supabase'
import CategoryDialog from './CategoryDialog'
import type { Category } from './data'
import { getSubcategoryNameError, type Subcategory } from './subcategories'
import { saveSubcategory } from './subcategoryData'

export default function CreateSubcategoryDialog({ client, category, subcategories, initialName = '', onCreated, onCancel }: {
  client: SupabaseClient
  category: Category
  subcategories: readonly Subcategory[]
  initialName?: string
  onCreated: (subcategory: Subcategory) => void
  onCancel: () => void
}) {
  const [id] = useState(() => crypto.randomUUID())
  const [name, setName] = useState(initialName)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return
    const nameError = getSubcategoryNameError(name, subcategories, category.id, id)
    if (nameError) {
      setError(nameError)
      return
    }
    if (!navigator.onLine || !canReachSupabase()) {
      setError('Для створення підкатегорії потрібен інтернет.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      onCreated(await saveSubcategory(client, id, name.trim(), category))
    } catch (cause) {
      const duplicate = cause && typeof cause === 'object' && 'code' in cause && cause.code === '23505'
      setError(duplicate ? 'У цій категорії вже є така назва.' : 'Не вдалося зберегти підкатегорію. Спробуй ще раз.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <CategoryDialog title="Нова підкатегорія" isSaving={isSaving} onCancel={onCancel}>
      <form onSubmit={(event) => void save(event)} className="rounded-2xl border border-zinc-800 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Нова підкатегорія</h2>
        <p className="mt-1 text-sm text-zinc-400 [overflow-wrap:anywhere]">Категорія «{category.name}»</p>
        <label className="mt-4 grid gap-2 text-sm font-medium">
          Назва підкатегорії
          <input name="name" value={name} onChange={(event) => setName(event.target.value)} disabled={isSaving} autoFocus required
            className="min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30" />
        </label>
        {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="submit" disabled={isSaving}
            className="min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60">
            {isSaving ? 'Зберігаємо…' : 'Зберегти'}
          </button>
          <button type="button" disabled={isSaving} onClick={onCancel}
            className="min-h-11 rounded-xl px-4 text-sm font-medium text-zinc-300 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60">
            Скасувати
          </button>
        </div>
      </form>
    </CategoryDialog>
  )
}
