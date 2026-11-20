import { useEffect, useState } from 'react'
import LoginForm from './LoginForm'
import { supabase } from './lib/supabase'

function App() {
  const [hasSession, setHasSession] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    if (!supabase) return

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(session !== null)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <main className="grid min-h-dvh place-items-center bg-zinc-950 px-4 py-8 text-zinc-100">
      {!supabase && (
        <p role="alert">Не вдалося налаштувати підключення до Supabase.</p>
      )}
      {supabase && hasSession === undefined && (
        <p role="status">Перевіряємо сесію…</p>
      )}
      {supabase && hasSession === false && <LoginForm client={supabase} />}
      {hasSession && (
        <h1 className="text-2xl font-semibold tracking-tight">Персональні фінанси</h1>
      )}
    </main>
  )
}

export default App
