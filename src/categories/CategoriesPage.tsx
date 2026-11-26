import type { OfflinePageProps } from '../offline/snapshot'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLoadData } from '../lib/useLoadData'
import CategoryForm from './CategoryForm'
import CategoryLabel from './CategoryLabel'
import { deleteUnusedCategory, getAvailableCategories, loadCategories, loadUsedCategoryIds, saveCategory, setCategoryHidden, type Category, type CategoryType } from './data'
import SubcategoryManager from './SubcategoryManager'
import { loadSubcategories, saveSubcategory, setSubcategoryHidden } from './subcategoryData'
import type { Subcategory } from './subcategories'

const buttonClass = 'min-h-11 rounded-xl border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-50'
const categoryActionClass = `${buttonClass} inline-flex min-w-11 items-center justify-center`
const categoryTypes = [
  { type: 'expense', label: 'Витрати' },
  { type: 'income', label: 'Доходи' },
] as const

type CategoryDeletion = { id: string; confirm: boolean }

function CategoryList({
  categories,
  subcategories,
  label,
  disabled,
  deletion,
  getDeletionReason,
  onEdit,
  onToggleHidden,
  onChooseDeletion,
  onDelete,
  onSaveSubcategory,
  onHideSubcategory,
}: {
  categories: Category[]
  subcategories: readonly Subcategory[] | null
  label: string
  disabled: boolean
  deletion: CategoryDeletion | null
  getDeletionReason: (id: string) => string | null
  onEdit: (category: Category) => void
  onToggleHidden: (category: Category) => void
  onChooseDeletion: (id: string | null) => void
  onDelete: (category: Category) => void
  onSaveSubcategory: (id: string, name: string, newCategory?: Category) => Promise<void>
  onHideSubcategory: (id: string, isHidden: boolean) => Promise<void>
}) {
  return (
    <ul aria-label={label} className="grid gap-2">
      {categories.map((category) => {
        const action = category.is_hidden ? 'Відновити' : 'Приховати'
        const reason = getDeletionReason(category.id)
        const showReason = deletion?.id === category.id && !!reason
        const showConfirmation = deletion?.id === category.id && deletion.confirm && !reason
        const reasonId = `category-deletion-reason-${category.id}`

        return (
          <li key={category.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
            <div className="min-w-0 text-sm"><CategoryLabel name={category.name} color={category.color} /></div>
            <div className="flex gap-2">
              <button
                type="button"
                className={categoryActionClass}
                disabled={disabled}
                aria-label={`Редагувати категорію ${category.name}`}
                onClick={() => onEdit(category)}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5 md:hidden">
                  <path d="m15 5 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z" />
                </svg>
                <span className="hidden md:inline">Редагувати</span>
              </button>
              <button
                type="button"
                className={categoryActionClass}
                disabled={disabled}
                aria-label={`${action} категорію ${category.name}`}
                onClick={() => onToggleHidden(category)}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5 md:hidden">
                  {category.is_hidden ? (
                    <>
                      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
                      <circle cx="12" cy="12" r="2.5" />
                    </>
                  ) : (
                    <>
                      <path d="M3 3l18 18M10.6 6.1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3 3.3M6.5 7.5C3.6 9.3 2 12 2 12s3.6 6 10 6c1.5 0 2.8-.3 4-.8" />
                      <path d="M10.2 10.2a2.5 2.5 0 0 0 3.6 3.6" />
                    </>
                  )}
                </svg>
                <span className="hidden md:inline">{action}</span>
              </button>
              <button
                type="button"
                className={`${categoryActionClass} aria-disabled:text-zinc-500 aria-disabled:hover:bg-transparent`}
                aria-disabled={!!reason}
                aria-label={`Видалити категорію ${category.name}`}
                aria-describedby={reason ? reasonId : undefined}
                onClick={() => onChooseDeletion(showReason || showConfirmation ? null : category.id)}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5 md:hidden">
                  <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
                </svg>
                <span className="hidden md:inline">Видалити</span>
              </button>
            </div>
            {reason && (
              <p id={reasonId} hidden={!showReason} role="status" className="col-span-2 rounded-xl bg-zinc-800/60 px-3 py-2 text-sm text-zinc-200">
                {reason}
              </p>
            )}
            {showConfirmation && (
              <div className="col-span-2 space-y-2 rounded-xl border border-rose-900/70 bg-rose-950/20 p-3">
                <p className="text-sm text-rose-100 [overflow-wrap:anywhere]">Видалити категорію «{category.name}»?</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="min-h-11 rounded-xl bg-rose-300 px-3 text-sm font-semibold text-zinc-950 hover:bg-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300 disabled:opacity-50"
                    disabled={disabled}
                    onClick={() => onDelete(category)}
                  >
                    Так, видалити
                  </button>
                  <button type="button" className={buttonClass} disabled={disabled} onClick={() => onChooseDeletion(null)}>
                    Скасувати
                  </button>
                </div>
              </div>
            )}
            {subcategories && <SubcategoryManager category={category} subcategories={subcategories} readOnly={disabled}
              onSave={onSaveSubcategory} onHide={onHideSubcategory} />}
          </li>
        )
      })}
    </ul>
  )
}

export default function CategoriesPage({ client, snapshot }: OfflinePageProps) {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [usedCategoryIds, setUsedCategoryIds] = useState<ReadonlySet<string> | 'unavailable' | null>(null)
  const [deletion, setDeletion] = useState<CategoryDeletion | null>(null)
  const [categoryType, setCategoryType] = useState<CategoryType>('expense')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const [editor, setEditor] = useState<{ id: string; initialName: string; initialColor: string | null; isNew: boolean } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null)
  const saving = useRef(false)
  const loadChildren = useCallback((signal: AbortSignal) => loadSubcategories(client, signal, snapshot), [client, snapshot])
  const { data: subcategories, setData: setSubcategories, hasError: subcategoriesError, retry: retrySubcategories } = useLoadData(loadChildren)

  useEffect(() => {
    const controller = new AbortController()

    void loadCategories(client, controller.signal, snapshot).then(
      (rows) => {
        if (!controller.signal.aborted) setCategories(rows)
      },
      () => {
        if (!controller.signal.aborted) setLoadError(true)
      },
    )
    void loadUsedCategoryIds(client, controller.signal, snapshot).then(
      (ids) => {
        if (!controller.signal.aborted) setUsedCategoryIds(ids)
      },
      () => {
        if (!controller.signal.aborted) setUsedCategoryIds('unavailable')
      },
    )

    return () => controller.abort()
  }, [client, loadAttempt, snapshot])

  function openEditor(category?: Category) {
    setFeedback(null)
    setDeletion(null)
    setEditor({
      id: category?.id ?? crypto.randomUUID(),
      initialName: category?.name ?? '',
      initialColor: category?.color ?? null,
      isNew: !category,
    })
  }

  function upsertCategoryInList(category: Category) {
    setCategories((current) => current && [...current.filter(({ id }) => id !== category.id), category])
  }

  function updateSubcategoryList(subcategory: Subcategory) {
    setSubcategories((current) => current && [...current.filter(({ id }) => id !== subcategory.id), subcategory])
  }

  async function applyCategoryChange(change: () => Promise<string | undefined>, errorMessage: string) {
    if (snapshot || saving.current) return

    saving.current = true
    setIsSaving(true)
    setFeedback(null)

    try {
      const message = await change()
      if (message) setFeedback({ message, isError: false })
    } catch {
      setFeedback({ message: errorMessage, isError: true })
    } finally {
      saving.current = false
      setIsSaving(false)
    }
  }

  function handleSave(name: string, color: string | null) {
    if (!editor) return

    void applyCategoryChange(async () => {
      const category = await saveCategory(client, editor.id, name, color, editor.isNew ? categoryType : undefined)
      upsertCategoryInList(category)
      setEditor(null)
      return editor.isNew ? 'Категорію додано.' : 'Зміни категорії збережено.'
    }, 'Не вдалося зберегти категорію. Спробуйте ще раз.')
  }

  function handleToggleHidden(category: Category) {
    const isHidden = !category.is_hidden
    setDeletion(null)
    void applyCategoryChange(async () => {
      upsertCategoryInList(await setCategoryHidden(client, category.id, isHidden))
      return isHidden ? 'Категорію приховано.' : 'Категорію відновлено.'
    }, 'Не вдалося змінити видимість категорії. Спробуйте ще раз.')
  }

  function getDeletionReason(id: string) {
    if (usedCategoryIds !== 'unavailable' && usedCategoryIds?.has(id)) {
      return 'Категорія вже використовувалася в транзакції або повторюваному шаблоні.'
    }
    if (snapshot) return 'Для видалення категорії потрібен інтернет.'
    if (isSaving) return 'Зачекай, поки збережуться зміни.'
    if (editor) return 'Спочатку збережи або скасуй редагування категорії.'
    if (usedCategoryIds === 'unavailable') return 'Не вдалося перевірити використання категорії. Онови сторінку.'
    if (!usedCategoryIds) return 'Перевіряємо, чи використовувалася категорія.'
    return null
  }

  function chooseDeletion(id: string | null) {
    setFeedback(null)
    setDeletion(id ? { id, confirm: !getDeletionReason(id) } : null)
  }

  function handleDelete(category: Category) {
    if (getDeletionReason(category.id)) return
    void applyCategoryChange(async () => {
      const removed = await deleteUnusedCategory(client, category.id)
      if (!removed) {
        setUsedCategoryIds((current) => current && current !== 'unavailable' ? new Set([...current, category.id]) : current)
        setDeletion({ id: category.id, confirm: false })
        return
      }
      setDeletion(null)
      setCategories((current) => current && current.filter(({ id }) => id !== category.id))
      return 'Категорію видалено.'
    }, 'Не вдалося видалити категорію. Спробуй ще раз.')
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
    subcategories,
    disabled: isSaving || !!editor || !!snapshot,
    deletion,
    getDeletionReason,
    onEdit: openEditor,
    onToggleHidden: handleToggleHidden,
    onChooseDeletion: chooseDeletion,
    onDelete: handleDelete,
    onSaveSubcategory: async (id: string, name: string, newCategory?: Category) => {
      updateSubcategoryList(await saveSubcategory(client, id, name, newCategory))
    },
    onHideSubcategory: async (id: string, isHidden: boolean) => {
      updateSubcategoryList(await setSubcategoryHidden(client, id, isHidden))
    },
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
              onClick={() => {
                setCategoryType(type)
                setDeletion(null)
              }}
              className="min-h-10 rounded-lg px-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 aria-pressed:bg-emerald-300/10 aria-pressed:text-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60"
            >
              {label}
            </button>
          ))}
        </div>
        {!editor && !snapshot && (
          <button type="button" disabled={isSaving} className={buttonClass} onClick={() => openEditor()}>
            Додати категорію
          </button>
        )}
      </div>

      {editor && (
        <CategoryForm
          key={editor.id}
          initialName={editor.initialName}
          initialColor={editor.initialColor}
          isNew={editor.isNew}
          isSaving={isSaving || !!snapshot}
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
      {subcategoriesError && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-rose-300">Не вдалося завантажити підкатегорії.</p>
          <button type="button" className={buttonClass} onClick={retrySubcategories}>Спробувати ще раз</button>
        </div>
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
