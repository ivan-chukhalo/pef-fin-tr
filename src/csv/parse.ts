export const maxCsvBytes = 1024 * 1024
export const maxCsvRows = 1000

export type CsvFile = {
  headers: string[]
  rows: { line: number; cells: string[] }[]
  fingerprint: string
}

export async function csvHash(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function readRecord(text: string, start: number, delimiter: string) {
  const cells: string[] = []
  let value = ''
  let cursor = start
  let state: 'start' | 'text' | 'quoted' | 'closed' = 'start'

  while (cursor < text.length) {
    const character = text[cursor++]
    if (state === 'quoted') {
      if (character !== '"') value += character
      else if (text[cursor] === '"') {
        value += '"'
        cursor++
      } else state = 'closed'
    } else if (character === delimiter || character === '\n') {
      cells.push(value)
      if (character === '\n') return { cells, cursor }
      value = ''
      state = 'start'
    } else if (character === '"' && state === 'start') {
      state = 'quoted'
    } else {
      if (character === '"' || state === 'closed') throw new Error('Некоректні лапки.')
      value += character
      state = 'text'
    }
  }

  if (state === 'quoted') throw new Error('Незакриті лапки.')
  cells.push(value)
  return { cells, cursor }
}

export async function readCsvFile(file: File): Promise<CsvFile> {
  if (file.size > maxCsvBytes) throw new Error('Вибери файл розміром до 1 МБ.')
  const bytes = await file.arrayBuffer()
  let decoded: string
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    decoded = new TextDecoder('windows-1251').decode(bytes)
  }
  const text = decoded.replace(/\r\n?/g, '\n')
  if (text.includes('\0')) throw new Error('Вибери текстовий CSV у кодуванні UTF-8 або Windows-1251.')

  const preamble = /^(?:[ \t]*\n)*(?:sep=[;,\t]\n)?/i.exec(text)?.[0] ?? ''
  let line = preamble.split('\n').length
  const header = [';', ',', '\t'].map((delimiter) => {
    try {
      return { ...readRecord(text, preamble.length, delimiter), delimiter }
    } catch {
      return null
    }
  }).filter((entry) => entry !== null).sort((first, second) => second.cells.length - first.cells.length)[0]
  if (!header || header.cells.length < 2 || !header.cells.some((cell) => cell.trim())) {
    throw new Error('Не вдалося розпізнати заголовки CSV. Перевір перший рядок і роздільник.')
  }
  if (header.cells.length > 100) throw new Error('У CSV має бути до 100 колонок.')

  const headers = header.cells.map((cell) => cell.trim())
  line += text.slice(preamble.length, header.cursor).split('\n').length - 1
  let cursor = header.cursor
  const rows: CsvFile['rows'] = []
  while (cursor < text.length) {
    let record: ReturnType<typeof readRecord>
    try {
      record = readRecord(text, cursor, header.delimiter)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Помилка читання.'
      throw new Error(`Рядок ${line}. ${reason}`, { cause: error })
    }
    if (record.cells.some((cell) => cell.trim())) rows.push({ line, cells: record.cells })
    if (rows.length > maxCsvRows) throw new Error(`У файлі має бути до ${maxCsvRows} операцій. Розділи його на кілька файлів.`)
    line += text.slice(cursor, record.cursor).split('\n').length - 1
    cursor = record.cursor
  }
  if (!rows.length) throw new Error('У файлі є заголовки, але немає операцій.')

  // A repeat of the same file is stable across line endings, encoding and blank lines.
  return { headers, rows, fingerprint: await csvHash(JSON.stringify([headers, rows.map(({ cells }) => cells)])) }
}
