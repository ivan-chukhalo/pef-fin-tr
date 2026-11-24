import AppShell from './AppShell'
import LoginForm from './LoginForm'
import { supabase } from './lib/supabase'
import { useOfflineData } from './offline/useOfflineData'
import { useOfflineWorker } from './offline/useOfflineWorker'

function App() {
  const { online, userId, snapshot, transactionOverlay, pendingTransfers,
    queueTransaction, queueTransfer, queueTransactionChange, resolveTransactionConflict, retrySync } = useOfflineData(supabase)
  const worker = useOfflineWorker()

  if (supabase && userId && (online || snapshot)) {
    const readiness = worker === 'ready' && !snapshot ? 'preparing' : worker
    return <AppShell
      key={userId}
      client={supabase}
      snapshot={online ? undefined : snapshot ?? undefined}
      transactionOverlay={transactionOverlay}
      pendingTransfers={pendingTransfers}
      queueTransaction={queueTransaction}
      queueTransfer={queueTransfer}
      queueTransactionChange={queueTransactionChange}
      resolveTransactionConflict={resolveTransactionConflict}
      retrySync={retrySync}
      offlineReadiness={online && import.meta.env.PROD ? readiness : undefined}
    />
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-zinc-950 px-4 py-8 text-zinc-100">
      {!supabase && (
        <p role="alert">Не вдалося налаштувати підключення до Supabase.</p>
      )}
      {supabase && !online && (
        <p role="status" className="text-center">
          {userId && snapshot === undefined ? 'Відкриваємо локальну копію…'
            : 'Локальна копія недоступна. Підключися до інтернету, щоб завантажити дані.'}
        </p>
      )}
      {supabase && online && userId === undefined && (
        <p role="status">Перевіряємо сесію…</p>
      )}
      {supabase && online && userId === null && <LoginForm client={supabase} />}
    </main>
  )
}

export default App
