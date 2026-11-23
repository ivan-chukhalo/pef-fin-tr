import { useRef, useState, type ChangeEvent } from 'react'
import { formatDate, isDateOnOrBefore } from './dates'

function formatInputText(value: string): string {
  const text = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return formatDate(text)

  const parts = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text)
  if (parts) {
    const [, day, month, year] = parts
    return `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}`
  }

  const digits = text.replace(/\D/g, '').slice(0, 8)
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('.')
}

function parseInputDate(text: string): string {
  if (text.length !== 10) return ''
  const [day, month, year] = text.split('.')
  const date = `${year}-${month}-${day}`
  return isDateOnOrBefore(date) ? date : ''
}

export default function DateInput({ id, name, defaultValue, className, min, max = '9999-12-31', required, onDateChange, ...accessibility }: {
  id: string
  name?: string
  defaultValue: string
  className: string
  min?: string
  max?: string
  required?: boolean
  onDateChange?: (date: string) => void
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}) {
  const [text, setText] = useState(() => defaultValue ? formatDate(defaultValue) : '')
  const input = useRef<HTMLInputElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const date = parseInputDate(text)
  const hasPicker = 'showPicker' in HTMLInputElement.prototype
  const pickerDate = date >= (min ?? '') && date <= max ? date : ''

  function changeText(event: ChangeEvent<HTMLInputElement>) {
    const field = event.currentTarget
    const next = formatInputText(field.value)
    const cursor = field.selectionStart ?? field.value.length
    if (next !== field.value && cursor !== field.value.length) {
      const digitsBeforeCursor = field.value.slice(0, cursor).replace(/\D/g, '').length
      const digit = [...next.matchAll(/\d/g)][digitsBeforeCursor - 1]
      const nextCursor = digit ? digit.index + 1 : 0
      field.value = next
      field.setSelectionRange(nextCursor, nextCursor)
    }
    setText(next)
    onDateChange?.(parseInputDate(next))
  }

  return (
    <div className="relative min-w-0">
      <input
        {...accessibility}
        ref={input}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="ДД.ММ.РРРР"
        className={`w-full tabular-nums ${className} ${hasPicker ? 'pr-11' : ''}`}
        value={text}
        required={required}
        onChange={changeText}
      />
      {name && <input type="hidden" name={name} value={date} />}
      {hasPicker && (
        <>
          <input
            ref={picker}
            type="date"
            lang="uk"
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full opacity-0"
            min={min}
            max={max}
            value={pickerDate}
            onChange={(event) => {
              const selected = event.currentTarget.value
              setText(selected ? formatDate(selected) : '')
              onDateChange?.(selected)
            }}
          />
          <button
            type="button"
            aria-label="Відкрити календар"
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-zinc-400 hover:text-zinc-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-300"
            onClick={() => {
              try {
                picker.current?.showPicker()
              } catch {
                input.current?.focus()
              }
            }}
          >
            <span aria-hidden="true" className="size-4 rounded-sm border border-current border-t-4" />
          </button>
        </>
      )}
    </div>
  )
}
