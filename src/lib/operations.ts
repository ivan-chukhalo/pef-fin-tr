import { isDateOnOrBefore, todayInKyiv } from './dates'

export type OperationStatus = 'planned' | 'confirmed'
export type OperationStatusFilter = OperationStatus | 'all'

export function getOperationDateError(date: string, status: OperationStatus): string {
  const today = todayInKyiv()
  if (status === 'planned') {
    return isDateOnOrBefore(date) && date > today ? '' : 'Для запланованої операції оберіть майбутню дату.'
  }
  return isDateOnOrBefore(date, today) ? '' : 'Вкажіть коректну дату, не пізнішу за сьогодні.'
}
