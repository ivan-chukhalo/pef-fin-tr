import { useEffect, useRef, type ReactNode } from 'react'

export default function CategoryDialog({ title, isSaving, onCancel, children }: {
  title: string
  isSaving: boolean
  onCancel: () => void
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog ref={dialogRef} aria-label={title}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-auto rounded-2xl bg-zinc-900 p-0 text-zinc-100 backdrop:bg-black/70"
      onCancel={(event) => {
        event.preventDefault()
        if (!isSaving) onCancel()
      }}>
      {children}
    </dialog>
  )
}
