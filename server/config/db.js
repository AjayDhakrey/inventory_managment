import mongoose from 'mongoose'
import dns from 'node:dns'
import { env } from './env.js'

let transactionsSupported = null
let listenersBound = false

export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1
}

function printHelp() {
  console.warn(
    [
      '',
      '  ┌────────────────────────────────────────────────────────────────────┐',
      '  │  MongoDB is not reachable.                                          │',
      '  │  The API is running, but every data request will return HTTP 503   │',
      '  │  until a database is connected.                                     │',
      '  │                                                                    │',
      '  │  Fix: set MONGODB_URI in server/.env to a running MongoDB, e.g.     │',
      '  │    - MongoDB Atlas:  mongodb+srv://<user>:<pass>@<cluster>/inv_app  │',
      '  │    - Local install:  mongodb://127.0.0.1:27017/inventory_app        │',
      `  │  Current value: ${env.mongoUri.replace(/\/\/[^@]*@/, '//***@').slice(0, 48).padEnd(50)}│`,
      '  └────────────────────────────────────────────────────────────────────┘',
      '',
    ].join('\n'),
  )
}

/**
 * Connects to MongoDB and keeps retrying in the background if it is not
 * reachable. Never throws - the HTTP server stays up so /api/health works and
 * data routes can return a clear 503 instead of a dead connection.
 */
export async function connectDatabase() {
  mongoose.set('strictQuery', true)

  // Some ISP/router DNS proxies refuse the SRV queries required by Atlas even
  // though normal DNS works. Use reliable public resolvers for mongodb+srv
  // lookups; ordinary/local MongoDB connection strings are unaffected.
  if (env.mongoUri.startsWith('mongodb+srv://')) {
    dns.setServers(['1.1.1.1', '8.8.8.8'])
  }

  if (!listenersBound) {
    listenersBound = true
    mongoose.connection.on('connected', () => {
      console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`)
    })
    mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected - retrying...'))
    mongoose.connection.on('error', (error) => console.error('MongoDB error:', error.message))
  }

  await attempt(1)
}

async function attempt(count) {
  try {
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    })
  } catch (error) {
    console.error(`MongoDB connection failed (attempt ${count}): ${error.message}`)
    if (count === 1) printHelp()
    setTimeout(() => attempt(count + 1), 5000).unref()
  }
}

export async function disconnectDatabase() {
  await mongoose.disconnect()
}

/**
 * Runs `work` inside a MongoDB transaction when the deployment supports it
 * (replica set / Atlas). On a standalone server that cannot start a transaction,
 * it falls back to running the writes sequentially so local development still
 * works. Data always goes to MongoDB either way.
 */
export async function withTransaction(work) {
  if (transactionsSupported === false) return work(null)

  const session = await mongoose.startSession()
  try {
    let result
    await session.withTransaction(async () => {
      result = await work(session)
    })
    transactionsSupported = true
    return result
  } catch (error) {
    const notSupported =
      error?.code === 20 ||
      /Transaction numbers are only allowed on a replica set|does not support transactions/i.test(error?.message || '')
    if (notSupported) {
      transactionsSupported = false
      console.warn('MongoDB transactions unavailable (standalone server) - running writes without a transaction.')
      return work(null)
    }
    throw error
  } finally {
    session.endSession()
  }
}
