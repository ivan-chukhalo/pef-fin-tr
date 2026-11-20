import type { SupabaseClient } from '@supabase/supabase-js'
import { useState, type FormEvent } from 'react'

const inputClassName =
  'mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30'
const signInError = 'Не вдалося увійти. Спробуйте ще раз.'

export default function LoginForm({ client }: { client: SupabaseClient }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    const fields = new FormData(event.currentTarget)
    const email = String(fields.get('email') ?? '').trim()
    const password = String(fields.get('password') ?? '')

    setIsSubmitting(true)
    setErrorMessage('')

    try {
      const { error } = await client.auth.signInWithPassword({ email, password })
      if (error) {
        setErrorMessage(
          error.code === 'invalid_credentials'
            ? 'Неправильна електронна пошта або пароль.'
            : signInError,
        )
      }
    } catch {
      setErrorMessage(signInError)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl shadow-black/30 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Персональні фінанси</h1>
      <p className="mt-2 text-sm text-zinc-400">Увійдіть, щоб відкрити трекер.</p>

      <form aria-label="Вхід" className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Електронна пошта
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className={inputClassName}
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="text-sm font-medium">
            Пароль
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            className={inputClassName}
            required
          />
        </div>

        {errorMessage && (
          <p role="alert" className="text-sm text-rose-300">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-emerald-300 px-4 py-2.5 font-semibold text-zinc-950 transition-colors hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-wait disabled:opacity-60"
        >
          {isSubmitting ? 'Входимо…' : 'Увійти'}
        </button>
      </form>
    </section>
  )
}
