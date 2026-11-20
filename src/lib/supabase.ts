import { createClient } from '@supabase/supabase-js'

const projectUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL
const publishableKey: string | undefined = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase =
  projectUrl?.startsWith('https://') &&
  URL.canParse(projectUrl) &&
  publishableKey?.startsWith('sb_publishable_')
    ? createClient(projectUrl, publishableKey, {
        auth: { persistSession: true, detectSessionInUrl: false },
      })
    : null
