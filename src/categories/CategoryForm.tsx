import { useState, type FormEvent } from 'react'

export default function CategoryForm({
  initialName,
  isNew,
  isSaving,
  onSave,
  onCancel,
}: {
  initialName: string
  isNew: boolean
  isSaving: boolean
  onSave: (name: string) => void
  onCancel: () => void
}) {
  const [errorMessage, setErrorMessage] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return

    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
    if (!name) {
      setErrorMessage('Введіть назву категорії.')
      return
    }

    setErrorMessage('')
    onSave(name)
  }

  return (
    <form aria-labelledby="category-form-heading" onSubmit={handleSubmit} className="max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
      <h2 id="category-form-heading" className="text-lg font-semibold">
        {isNew ? 'Нова категорія' : 'Перейменувати категорію'}
      </h2>
      <label className="mt-4 grid gap-2 text-sm font-medium">
        Назва категорії
        <input
          name="name"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30"
          defaultValue={initialName}
          disabled={isSaving}
          autoFocus
          required
        />
      </label>
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
