import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Load server/.env first, then the project root .env as a fallback (no overrides).
dotenv.config({ path: [path.join(serverDir, '.env'), path.join(serverDir, '..', '.env')] })

function required(name, fallback) {
  const value = process.env[name] ?? fallback
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const nodeEnv = process.env.NODE_ENV || 'development'

export const env = {
  nodeEnv,
  port: Number(process.env.PORT) || 4000,
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/inventory_app'),
  jwtSecret: required('JWT_SECRET', nodeEnv === 'production' ? undefined : 'dev_only_insecure_secret_change_me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
}

export const isProduction = nodeEnv === 'production'
