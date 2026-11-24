import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
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
    VitePWA({
      manifest: false,
      injectRegister: false,
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{html,js,css,png,webmanifest}'],
        inlineWorkboxRuntime: true,
        // HashRouter uses the entry document for every app route.
        navigateFallbackAllowlist: [/^\/(?:index\.html)?(?:\?|$)/],
      },
    }),
    command === 'serve' && serveMonobank(loadEnv(mode, process.cwd(), ['VITE_SUPABASE_', 'MONOBANK_'])),
  ],
}))
