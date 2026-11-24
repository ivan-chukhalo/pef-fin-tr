import { isDateOnOrBefore, todayInKyiv } from './dates'

export type OperationStatus = 'planned' | 'confirmed'
export type OperationStatusFilter = OperationStatus | 'all'

export function isOverdueOperation({ date, status }: { date: string; status: OperationStatus }, today: string): boolean {
  return status === 'planned' && date < today
}

export function getPlanningDate(lastServerDate?: string): string {
  const today = todayInKyiv()
  return lastServerDate && lastServerDate > today ? lastServerDate : today
}

export function getOperationDateError(date: string, status: OperationStatus, existingDate?: string, lastServerDate?: string): string {
  if (status === 'planned') {
    return isDateOnOrBefore(date) && (date > getPlanningDate(lastServerDate) || date === existingDate) ? '' : 'Для запланованої операції оберіть майбутню дату.'
  }
  return isDateOnOrBefore(date, todayInKyiv()) ? '' : 'Вкажіть коректну дату, не пізнішу за сьогодні.'
}
