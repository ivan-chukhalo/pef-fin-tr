import { nextCalendarDate, todayInKyiv } from './dates'
import type { OperationStatus } from './operations'

export default function OperationDateField({ id, fieldClass, existingDate, status, onStatusChange, label = 'Дата' }: {
  id: string
  fieldClass: string
  existingDate?: string
  status: OperationStatus
  onStatusChange: (status: OperationStatus) => void
  label?: string
}) {
  const today = todayInKyiv()
  const tomorrow = nextCalendarDate(today)
  const planned = status === 'planned'
  const earliestPlannedDate = existingDate && existingDate < tomorrow ? existingDate : tomorrow

  return (
    <div className="grid min-w-0 gap-2 text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      <input key={status} id={id} type="date" name="date" className={fieldClass} defaultValue={existingDate ?? (planned ? tomorrow : today)} min={planned ? earliestPlannedDate : undefined} max={planned ? undefined : today} required />
      {!existingDate && (
        <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" className="size-4 accent-emerald-300" checked={planned} onChange={(event) => onStatusChange(event.target.checked ? 'planned' : 'confirmed')} />
          Запланувати на майбутнє
        </label>
      )}
    </div>
  )
}
