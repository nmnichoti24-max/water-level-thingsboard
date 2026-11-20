import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { respond } from './server/telemetry.js'
import { respondAuth } from './server/auth.js'

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ['TB_', 'AUTH_', 'APP_ORIGIN']), ...process.env }
  const publicEnv = loadEnv(mode, process.cwd(), 'VITE_API_BASE_URL')
  const target = process.env.VITE_API_BASE_URL ?? publicEnv.VITE_API_BASE_URL ?? ''
  let apiOrigin = ''
  if (mode === 'pages' && target) {
    const url = new URL(target)
    const allowed = url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1')
    if (!allowed || url.origin !== target) throw new Error('VITE_API_BASE_URL must be a canonical HTTPS or loopback origin')
    apiOrigin = url.origin
  }
  function api(server) {
    server.middlewares.use('/api/telemetry', (req, res) => respond(req, res, env))
    server.middlewares.use('/api/auth', (req, res) => respondAuth(req, res, env))
  }
  const pagesPolicy = {
    name: 'waterguard-pages-policy',
    apply: 'build',
    transformIndexHtml() {
      return [{
        tag: 'meta', injectTo: 'head-prepend',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'" +
            (apiOrigin ? ' ' + apiOrigin : '') + "; object-src 'none'; base-uri 'none'; form-action 'none'",
        },
      }]
    },
  }
  return {
    base: mode === 'pages' ? '/water-level-thingsboard/' : '/',
    plugins: [react(), { name: 'thingsboard-api', configureServer: api, configurePreviewServer: api }, ...(mode === 'pages' ? [pagesPolicy] : [])],
    // API middleware applies the exact Pages Origin allowlist.
    server: { host: '127.0.0.1', strictPort: true, cors: false },
    preview: { host: '127.0.0.1', strictPort: true, cors: false },
  }
})
