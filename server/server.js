import { env } from './config/env.js'
import { connectDatabase } from './config/db.js'
import { createApp } from './app.js'

const app = createApp()

app.listen(env.port, () => {
  console.log(`Stockroom API listening on http://localhost:${env.port} (${env.nodeEnv})`)
  console.log(`Health check: http://localhost:${env.port}/api/health`)
})

// Connect to MongoDB in the background. The HTTP server is already up, so a
// missing/unreachable database surfaces as a clear 503, not a dead port.
connectDatabase().catch((error) => {
  console.error('Unexpected database bootstrap error:', error)
})
