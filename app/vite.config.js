import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { respond } from './server/telemetry.js'

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'TB_'), ...process.env }
  function api(server) {
    server.middlewares.use('/api/telemetry', (req, res) => respond(req, res, env))
  }
  return {
    plugins: [react(), { name: 'thingsboard-api', configureServer: api, configurePreviewServer: api }],
    server: { host: '127.0.0.1', strictPort: true },
    preview: { host: '127.0.0.1', strictPort: true },
  }
})
