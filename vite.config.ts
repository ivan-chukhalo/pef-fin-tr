import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { createMonobankHandler } from './api/monobank.ts'

function serveMonobank(env: Record<string, string>): Plugin {
  const handleMonobank = createMonobankHandler(env)
  return {
    name: 'local-monobank-api',
    configureServer(server) {
      server.middlewares.use('/api/monobank', async (request, response) => {
        const authorization = request.headers.authorization
        const result = await handleMonobank(new Request(new URL(request.url ?? '/', 'http://127.0.0.1'), {
          method: request.method,
          headers: authorization ? { authorization } : {},
        }))
        response.statusCode = result.status
        result.headers.forEach((value, name) => response.setHeader(name, value))
        response.end(await result.text())
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    command === 'serve' && serveMonobank(loadEnv(mode, process.cwd(), ['VITE_SUPABASE_', 'MONOBANK_'])),
  ],
}))
