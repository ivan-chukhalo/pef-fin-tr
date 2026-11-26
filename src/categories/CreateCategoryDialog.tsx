import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import { canReachSupabase } from '../lib/supabase'
import CategoryForm from './CategoryForm'
import { saveCategory, type Category, type CategoryType } from './data'

export default function CreateCategoryDialog({ client, type, initialName = '', onCreated, onCancel }: {
  client: SupabaseClient
  type: CategoryType
  initialName?: string
  onCreated: (category: Category) => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [id] = useState(() => crypto.randomUUID())
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const heading = type === 'expense' ? 'Нова категорія витрат' : 'Нова категорія доходів'

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  async function save(name: string, color: string | null) {
    if (isSaving) return
    if (!navigator.onLine || !canReachSupabase()) {
      setError('Для створення категорії потрібен інтернет.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      const category = await saveCategory(client, id, name, color, type)
      onCreated(category)
    } catch {
      setError('Не вдалося зберегти категорію. Спробуй ще раз.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog ref={dialogRef} aria-label={heading}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-auto rounded-2xl bg-zinc-900 p-0 text-zinc-100 backdrop:bg-black/70"
      onCancel={(event) => {
        event.preventDefault()
        if (!isSaving) onCancel()
      }}>
      <CategoryForm initialName={initialName} initialColor={null} isNew heading={heading} isSaving={isSaving}
        saveError={error} onSave={(name, color) => void save(name, color)} onCancel={onCancel} />
    </dialog>
  )
}
