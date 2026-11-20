import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import CategoryForm from './CategoryForm'
import { getAvailableCategories, loadCategories, saveCategory, setCategoryHidden, type Category, type CategoryType } from './data'

const buttonClass = 'min-h-11 rounded-xl border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-50'
const categoryTypes = [
  { type: 'expense', label: 'Витрати' },
  { type: 'income', label: 'Доходи' },
] as const

function CategoryList({
  categories,
  label,
  disabled,
  onRename,
  onToggleHidden,
}: {
  categories: Category[]
  label: string
  disabled: boolean
  onRename: (category: Category) => void
  onToggleHidden: (category: Category) => void
}) {
  return (
    <ul aria-label={label} className="grid gap-2">
      {categories.map((category) => {
        const action = category.is_hidden ? 'Відновити' : 'Приховати'

        return (
          <li key={category.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
            <span className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{category.name}</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={disabled}
                aria-label={`Перейменувати категорію ${category.name}`}
                onClick={() => onRename(category)}
              >
                Перейменувати
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={disabled}
                aria-label={`${action} категорію ${category.name}`}
                onClick={() => onToggleHidden(category)}
              >
                {action}
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default function CategoriesPage({ client }: { client: SupabaseClient }) {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [categoryType, setCategoryType] = useState<CategoryType>('expense')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const [editor, setEditor] = useState<{ id: string; initialName: string; isNew: boolean } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null)
  const saving = useRef(false)

  useEffect(() => {
    const controller = new AbortController()

    void loadCategories(client, controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted) setCategories(rows)
      },
      () => {
        if (!controller.signal.aborted) setLoadError(true)
      },
    )

    return () => controller.abort()
  }, [client, loadAttempt])

  function openEditor(category?: Category) {
    setFeedback(null)
    setEditor({
      id: category?.id ?? crypto.randomUUID(),
      initialName: category?.name ?? '',
      isNew: !category,
    })
  }

  function upsertCategoryInList(category: Category) {
    setCategories((current) => current && [...current.filter(({ id }) => id !== category.id), category])
  }

  async function applyCategoryChange(change: () => Promise<string>, errorMessage: string) {
    if (saving.current) return

    saving.current = true
    setIsSaving(true)
    setFeedback(null)

    try {
      const message = await change()
      setFeedback({ message, isError: false })
    } catch {
      setFeedback({ message: errorMessage, isError: true })
    } finally {
      saving.current = false
      setIsSaving(false)
    }
  }

  function handleSave(name: string) {
    if (!editor) return

    void applyCategoryChange(async () => {
      const category = await saveCategory(client, editor.id, name, editor.isNew ? categoryType : undefined)
      upsertCategoryInList(category)
      setEditor(null)
      return editor.isNew ? 'Категорію додано.' : 'Категорію перейменовано.'
    }, 'Не вдалося зберегти категорію. Спробуйте ще раз.')
  }

  function handleToggleHidden(category: Category) {
    const isHidden = !category.is_hidden
    void applyCategoryChange(async () => {
      upsertCategoryInList(await setCategoryHidden(client, category.id, isHidden))
      return isHidden ? 'Категорію приховано.' : 'Категорію відновлено.'
    }, 'Не вдалося змінити видимість категорії. Спробуйте ще раз.')
  }

  if (!categories) {
    return loadError ? (
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <p role="alert" className="text-sm text-rose-300">Не вдалося завантажити категорії.</p>
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setLoadError(false)
            setLoadAttempt((attempt) => attempt + 1)
          }}
        >
          Спробувати ще раз
        </button>
      </div>
    ) : <p role="status" className="mt-6 text-sm text-zinc-400">Завантажуємо категорії…</p>
  }

  const visibleCategories = getAvailableCategories(categories, categoryType)
  const hiddenCategories = categories
    .filter((category) => category.type === categoryType && category.is_hidden)
    .sort((first, second) => first.name.localeCompare(second.name, 'uk-UA'))
  const groupName = categoryType === 'expense' ? 'витрат' : 'доходів'
  const listActions = {
    disabled: isSaving || !!editor,
    onRename: openEditor,
    onToggleHidden: handleToggleHidden,
  }

  return (
    <div className="mt-6 max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Тип категорій" className="inline-flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1">
          {categoryTypes.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              aria-pressed={categoryType === type}
              disabled={isSaving || !!editor}
              onClick={() => setCategoryType(type)}
              className="min-h-10 rounded-lg px-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 aria-pressed:bg-emerald-300/10 aria-pressed:text-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60"
            >
              {label}
            </button>
          ))}
        </div>
        {!editor && (
          <button type="button" disabled={isSaving} className={buttonClass} onClick={() => openEditor()}>
            Додати категорію
          </button>
        )}
      </div>

      {editor && (
        <CategoryForm
          key={editor.id}
          initialName={editor.initialName}
          isNew={editor.isNew}
          isSaving={isSaving}
          onSave={handleSave}
          onCancel={() => {
            setEditor(null)
            setFeedback(null)
          }}
        />
      )}
      {feedback && (
        <p role={feedback.isError ? 'alert' : 'status'} className={`text-sm ${feedback.isError ? 'text-rose-300' : 'text-emerald-200'}`}>
          {feedback.message}
        </p>
      )}
      {visibleCategories.length ? (
        <CategoryList categories={visibleCategories} label={`Активні категорії ${groupName}`} {...listActions} />
      ) : (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
          Активних категорій {groupName} немає.
        </p>
      )}
      {hiddenCategories.length > 0 && (
        <details className="rounded-2xl border border-zinc-800 p-4">
          <summary className="cursor-pointer rounded-sm text-sm font-medium text-zinc-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
            Приховані категорії ({hiddenCategories.length})
          </summary>
          <div className="mt-4">
            <CategoryList categories={hiddenCategories} label={`Приховані категорії ${groupName}`} {...listActions} />
          </div>
        </details>
      )}
    </div>
  )
}
