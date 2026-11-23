import type { SupabaseClient } from '@supabase/supabase-js'
import { useRef, useState } from 'react'
import { formatDate, todayInKyiv } from '../lib/dates'
import { isBackup } from './backup'

export default function BackupDownload({ client }: { client: SupabaseClient }) {
  const [status, setStatus] = useState<'idle' | 'preparing' | 'ready' | 'error'>('idle')
  const preparing = useRef(false)

  async function handleDownload() {
    if (preparing.current) return

    preparing.current = true
    setStatus('preparing')
    try {
      const { data, error } = await client.rpc('export_backup')
      if (error || !isBackup(data)) throw new Error('Backup unavailable')

      const blob = new Blob([JSON.stringify(data, null, 2), '\n'], { type: 'application/json;charset=utf-8' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.href = url
      link.download = `pef-fin-tr-${formatDate(todayInKyiv(new Date(data.exported_at)))}.json`
      document.body.append(link)
      try {
        link.click()
      } finally {
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      }
      setStatus('ready')
    } catch {
      setStatus('error')
    } finally {
      preparing.current = false
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={status === 'preparing'}
        onClick={() => void handleDownload()}
        className="min-h-11 rounded-xl bg-emerald-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60"
      >
        {status === 'preparing' ? 'Готуємо резервну копію…' : 'Завантажити резервну копію'}
      </button>
      {status === 'ready' && <p role="status" className="mt-2 text-sm text-zinc-300">Файл резервної копії підготовлено.</p>}
      {status === 'error' && <p role="alert" className="mt-2 text-sm text-rose-300">Не вдалося підготувати резервну копію. Спробуйте ще раз.</p>}
    </div>
  )
}
