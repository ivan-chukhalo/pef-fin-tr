import { useState, type FormEvent } from 'react'
import CategoryLabel from './CategoryLabel'
import { isCategoryColor } from './color'

const fieldClass = 'min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-100 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30'

export default function CategoryForm({
  initialName,
  initialColor,
  isNew,
  isSaving,
  onSave,
  onCancel,
}: {
  initialName: string
  initialColor: string | null
  isNew: boolean
  isSaving: boolean
  onSave: (name: string, color: string | null) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [colorInput, setColorInput] = useState(initialColor ?? '')
  const [errorMessage, setErrorMessage] = useState('')
  const color = colorInput.trim().toLowerCase()
  const validColor = isCategoryColor(color)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return

    if (!name.trim()) {
      setErrorMessage('Введіть назву категорії.')
      return
    }
    if (color && !validColor) {
      setErrorMessage('Введіть колір у форматі #RRGGBB, наприклад #8B5CF6.')
      return
    }

    setErrorMessage('')
    onSave(name.trim(), color || null)
  }

  return (
    <form aria-labelledby="category-form-heading" onSubmit={handleSubmit} className="max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
      <h2 id="category-form-heading" className="text-lg font-semibold">
        {isNew ? 'Нова категорія' : 'Редагувати категорію'}
      </h2>
      <label className="mt-4 grid gap-2 text-sm font-medium">
        Назва категорії
        <input
          name="name"
          className={`w-full px-3 py-2.5 ${fieldClass}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={isSaving}
          autoFocus
          required
        />
      </label>
      <fieldset disabled={isSaving} className="mt-4 grid min-w-0 gap-2 text-sm font-medium">
        <legend className="mb-2">Колір категорії</legend>
        <div className="flex flex-wrap gap-2">
          <input
            type="color"
            aria-label="Вибрати колір"
            className={`h-11 w-12 ${fieldClass} p-1`}
            value={validColor ? color : '#71717a'}
            onChange={(event) => setColorInput(event.target.value)}
          />
          <input
            aria-label="HEX-код кольору"
            className={`w-28 px-3 py-2.5 font-mono ${fieldClass}`}
            value={colorInput}
            placeholder="#8B5CF6"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setColorInput(event.target.value)}
          />
          <button
            type="button"
            className="min-h-11 rounded-xl border border-zinc-700 px-3 text-zinc-300 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-50"
            disabled={!colorInput}
            onClick={() => setColorInput('')}
          >
            Без кольору
          </button>
        </div>
        {name.trim() && <CategoryLabel name={name.trim()} color={color} />}
      </fieldset>
      {errorMessage && <p role="alert" className="mt-4 text-sm text-rose-300">{errorMessage}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isSaving}
          className="min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60"
        >
          {isSaving ? 'Зберігаємо…' : 'Зберегти'}
        </button>
        <button
          type="button"
          disabled={isSaving}
          className="min-h-11 rounded-xl px-4 text-sm font-medium text-zinc-300 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60"
          onClick={onCancel}
        >
          Скасувати
        </button>
      </div>
    </form>
  )
}
