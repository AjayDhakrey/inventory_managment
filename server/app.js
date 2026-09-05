import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env, isProduction } from './config/env.js'
import { api } from './routes/index.js'
import { notFound, errorHandler } from './middleware/errorHandler.js'

export function createApp() {
  const app = express()
  const allowedOrigins = env.clientUrl.split(',').map((value) => value.trim())

  app.use(helmet())
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin / curl (no Origin header) and any allow-listed client.
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
        // In development, accept localhost and local network / private IP origins.
        if (
          !isProduction &&
          (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
            /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin))
        ) {
          return callback(null, true)
        }
        return callback(new Error('Not allowed by CORS'))
      },
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '1mb' }))

  app.get('/', (_req, res) => res.json({ success: true, data: { service: 'stockroom-api', health: '/api/health' } }))
  app.use('/api', api)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
