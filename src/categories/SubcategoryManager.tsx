import { useState, type FormEvent } from 'react'
import type { Category } from './data'
import { defaultSubcategoryName, listSubcategories, type Subcategory } from './subcategories'

const buttonClass = 'inline-flex min-h-10 items-center rounded-lg border border-zinc-700 px-3 text-xs font-medium hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60'

export default function SubcategoryManager({ category, subcategories, readOnly, onSave, onHide }: {
  category: Category
  subcategories: readonly Subcategory[]
  readOnly: boolean
  onSave: (id: string, name: string, newCategory?: Category) => Promise<void>
  onHide: (id: string, isHidden: boolean) => Promise<void>
}) {
  const [editor, setEditor] = useState<{ id: string; name: string; isNew: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const rows = listSubcategories(subcategories, category.id)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor || saving || readOnly) return
    const name = editor.name.trim()
    if (!name || name.toLocaleLowerCase('uk-UA') === defaultSubcategoryName.toLocaleLowerCase('uk-UA')) {
      setError('Вкажи власну назву підкатегорії.')
      return
    }
    if (rows.some((row) => row.id !== editor.id && row.name.toLocaleLowerCase('uk-UA') === name.toLocaleLowerCase('uk-UA'))) {
      setError('У цій категорії вже є така назва.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(editor.id, name, editor.isNew ? category : undefined)
      setEditor(null)
    } catch {
      setError('Не вдалося зберегти підкатегорію. Спробуй ще раз.')
    } finally {
      setSaving(false)
    }
  }

  async function hide(subcategory: Subcategory) {
    if (saving || readOnly) return
    setSaving(true)
    setError('')
    try {
      await onHide(subcategory.id, !subcategory.is_hidden)
    } catch {
      setError('Не вдалося оновити підкатегорію. Спробуй ще раз.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <details className="col-span-2 border-t border-zinc-800 pt-2">
      <summary className="cursor-pointer rounded-sm text-sm text-zinc-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
        Підкатегорії
      </summary>
      <div className="mt-2 space-y-3">
        {rows.length ? (
          <ul aria-label={`Підкатегорії категорії «${category.name}»`} className="divide-y divide-zinc-800">
            {rows.map((subcategory) => (
              <li key={subcategory.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 text-sm [overflow-wrap:anywhere]">{subcategory.name}{subcategory.is_hidden ? ' (приховано)' : ''}</span>
                {!readOnly && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={buttonClass} disabled={saving} onClick={() => {
                      setError('')
                      setEditor({ id: subcategory.id, name: subcategory.name, isNew: false })
                    }}>Редагувати</button>
                    <button type="button" className={buttonClass} disabled={saving} onClick={() => void hide(subcategory)}>
                      {subcategory.is_hidden ? 'Відновити' : 'Приховати'}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-zinc-400">Власних підкатегорій ще немає.</p>}
        {!readOnly && !editor && !category.is_hidden && (
          <button type="button" className={buttonClass} disabled={saving} onClick={() => {
            setError('')
            setEditor({ id: crypto.randomUUID(), name: '', isNew: true })
          }}>Додати підкатегорію</button>
        )}
        {!readOnly && editor && (
          <form onSubmit={(event) => void save(event)} className="space-y-2">
            <label className="block text-sm font-medium">
              Назва підкатегорії
              <input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                disabled={saving} required
                className="mt-1 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm focus:border-emerald-300 focus:outline-none" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={buttonClass} disabled={saving}>Зберегти</button>
              <button type="button" className={buttonClass} disabled={saving} onClick={() => {
                setEditor(null)
                setError('')
              }}>Скасувати</button>
            </div>
          </form>
        )}
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      </div>
    </details>
  )
}
