import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { formatDateTimeInKyiv } from '../lib/dates'
import { useLoadData } from '../lib/useLoadData'
import { isBackupVersion, parseBackup, summaryKeys, summaryLabels, type Backup, type BackupVersion } from './backup'

type Selection = { requestId: string } & ({ backup: Backup; fileName: string } | { version: BackupVersion })

const buttonClass = 'min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-medium hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60'

export default function BackupRestore({ client }: { client: SupabaseClient }) {
  const [selection, setSelection] = useState<Selection | null>(null)
  const [reading, setReading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null)
  const reader = useRef(0)
  const applying = useRef(false)
  const previewHeading = useRef<HTMLHeadingElement>(null)
  const loadHistory = useCallback(async (signal: AbortSignal): Promise<BackupVersion[]> => {
    const { data, error } = await client.rpc('list_backup_versions').abortSignal(signal)
    if (error || !Array.isArray(data) || !data.every(isBackupVersion)) throw new Error('Backup history unavailable')
    return data
  }, [client])
  const { data: versions, hasError: historyError, retry: reloadHistory } = useLoadData(loadHistory)

  useEffect(() => {
    if (selection) previewHeading.current?.focus()
  }, [selection])

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    const attempt = ++reader.current
    setFeedback(null)
    setSelection(null)
    setReading(true)
    try {
      const backup = parseBackup(await file.text())
      if (reader.current === attempt) setSelection({ backup, fileName: file.name, requestId: crypto.randomUUID() })
    } catch (error) {
      if (reader.current === attempt) {
        setFeedback({ message: error instanceof Error ? error.message : 'Не вдалося прочитати файл.', error: true })
      }
    } finally {
      if (reader.current === attempt) setReading(false)
    }
  }

  function chooseVersion(version: BackupVersion) {
    reader.current += 1
    setReading(false)
    setFeedback(null)
    setSelection({ version, requestId: crypto.randomUUID() })
  }

  async function restore() {
    if (!selection || applying.current) return

    applying.current = true
    setRestoring(true)
    setFeedback(null)
    try {
      const source = 'backup' in selection ? { p_backup: selection.backup } : { p_version_id: selection.version.id }
      const { error } = await client.rpc('restore_backup', { p_request_id: selection.requestId, ...source })
      if (error?.code === 'P0002') {
        setSelection(null)
        reloadHistory()
        setFeedback({ message: 'Ця версія вже недоступна. Обери іншу копію.', error: true })
        return
      }
      if (error) throw error
      setSelection(null)
      setFeedback({ message: 'Дані відновлено. Попередній стан збережено в історії.', error: false })
      reloadHistory()
    } catch {
      setFeedback({ message: 'Не вдалося відновити дані. Спробуй ще раз або вибери іншу копію.', error: true })
    } finally {
      applying.current = false
      setRestoring(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <section aria-labelledby="backup-restore-heading" className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
        <h2 id="backup-restore-heading" className="font-semibold">Відновити з резервної копії</h2>
        <label className="grid gap-2 text-sm font-medium">
          Файл резервної копії JSON
          <input
            type="file"
            accept=".json,application/json"
            disabled={restoring}
            onChange={(event) => void chooseFile(event)}
            className="w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:font-medium file:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60"
          />
        </label>
        {reading && <p role="status" className="text-sm text-zinc-300">Перевіряємо файл…</p>}
        {selection && (
          <div className="space-y-3 rounded-xl border border-rose-900/70 bg-rose-950/20 p-4">
            <div className="space-y-1 [overflow-wrap:anywhere]">
              <h3 ref={previewHeading} tabIndex={-1} className="font-medium">
                {'backup' in selection ? selection.fileName : 'Версія з історії'}
              </h3>
              <p className="text-sm text-zinc-300">
                {formatDateTimeInKyiv('backup' in selection ? selection.backup.exported_at : selection.version.created_at)}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              {summaryKeys.map((key) => (
                <div key={key}>
                  <dt className="text-zinc-400">{summaryLabels[key]}</dt>
                  <dd className="font-medium">{'backup' in selection ? selection.backup[key].length : selection.version[key]}</dd>
                </div>
              ))}
              <div>
                <dt className="text-zinc-400">Підкатегорії</dt>
                <dd className="font-medium">
                  {'backup' in selection ? selection.backup.subcategories?.length ?? 0 : selection.version.subcategories ?? 0}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">Ліміти категорій</dt>
                <dd className="font-medium">
                  {'backup' in selection ? selection.backup.category_budget_limits?.length ?? 0 : selection.version.category_budget_limits ?? 0}
                </dd>
              </div>
            </dl>
            <p className="text-sm text-rose-100">Ця копія замінить поточні дані. Поточний стан збережеться в історії на 30 днів.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={restoring}
                onClick={() => void restore()}
                className="min-h-11 rounded-xl bg-rose-300 px-4 text-sm font-semibold text-zinc-950 hover:bg-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300 disabled:opacity-60"
              >
                {restoring ? 'Відновлюємо дані…' : 'Замінити дані з копії'}
              </button>
              <button type="button" className={buttonClass} disabled={restoring} onClick={() => { setSelection(null); setFeedback(null) }}>
                Скасувати
              </button>
            </div>
          </div>
        )}
        {feedback && (
          <p role={feedback.error ? 'alert' : 'status'} className={`text-sm ${feedback.error ? 'text-rose-300' : 'text-emerald-200'}`}>
            {feedback.message}
          </p>
        )}
      </section>

      <section aria-labelledby="backup-history-heading" className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
        <h2 id="backup-history-heading" className="font-semibold">Історія відновлень</h2>
        <p className="text-sm text-zinc-400">Попередні стани доступні 30 днів.</p>
        {historyError && (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-rose-300">Не вдалося завантажити історію.</p>
            <button type="button" className={buttonClass} disabled={restoring} onClick={reloadHistory}>Спробувати ще раз</button>
          </div>
        )}
        {!versions && !historyError && <p role="status" className="text-sm text-zinc-400">Завантажуємо історію…</p>}
        {versions?.length === 0 && !historyError && <p className="text-sm text-zinc-400">Збережених версій ще немає.</p>}
        {!!versions?.length && !historyError && (
          <ul aria-label="Збережені версії" className="divide-y divide-zinc-800">
            {versions.map((version) => {
              const date = formatDateTimeInKyiv(version.created_at)
              return (
                <li key={version.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <time dateTime={version.created_at} className="text-sm font-medium">{date}</time>
                  <button
                    type="button"
                    className={buttonClass}
                    aria-label={`Відновити версію ${date}`}
                    disabled={restoring}
                    onClick={() => chooseVersion(version)}
                  >
                    Відновити
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
