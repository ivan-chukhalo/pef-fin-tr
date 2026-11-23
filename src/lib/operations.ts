import { isDateOnOrBefore, todayInKyiv } from './dates'

export type OperationStatus = 'planned' | 'confirmed'
export type OperationStatusFilter = OperationStatus | 'all'

export function isOverdueOperation({ date, status }: { date: string; status: OperationStatus }, today: string): boolean {
  return status === 'planned' && date < today
}

export function getOperationDateError(date: string, status: OperationStatus, existingDate?: string): string {
  const today = todayInKyiv()
  if (status === 'planned') {
    return isDateOnOrBefore(date) && (date > today || date === existingDate) ? '' : 'Для запланованої операції оберіть майбутню дату.'
  }
  return isDateOnOrBefore(date, today) ? '' : 'Вкажіть коректну дату, не пізнішу за сьогодні.'
}
