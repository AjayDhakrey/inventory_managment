import mongoose from 'mongoose'
import dns from 'node:dns'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { env } from './env.js'

const execFileAsync = promisify(execFile)

let transactionsSupported = null
let listenersBound = false

// Node's bundled DNS resolver (c-ares) sometimes fails to read the real
// adapter DNS servers on Windows and silently falls back to 127.0.0.1, where
// nothing is listening - every mongodb+srv lookup then fails instantly with
// ECONNREFUSED even though the OS itself resolves DNS fine. Ask Windows
// directly for its configured resolver as an extra candidate.
async function getSystemDnsServers() {
  if (process.platform !== 'win32') return []
  try {
    const { stdout } = await execFileAsync('powershell', [
      '-NoProfile',
      '-Command',
      "(Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object { $_.ServerAddresses.Count -gt 0 -and $_.ServerAddresses -notcontains '127.0.0.1' } | Select-Object -First 1 -ExpandProperty ServerAddresses) -join ','",
    ], { timeout: 4000 })
    return stdout.trim().split(',').map((value) => value.trim()).filter(Boolean)
  } catch {
    return []
  }
}

// Races a tiny DNS lookup against each candidate resolver and returns the
// first one that actually answers, so we never pick a server that will just
// hang or get refused (public resolvers are blocked outbound on some networks).
async function findWorkingDnsServer(candidates) {
  for (const server of candidates) {
    const resolver = new dns.promises.Resolver()
    resolver.setServers([server])
    try {
      await Promise.race([
        resolver.resolve4('google.com'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
      ])
      return server
    } catch {
      // try the next candidate
    }
  }
  return null
}

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
  // though normal DNS works, and Node's own resolver can default to a dead
  // 127.0.0.1 on Windows. Probe the real system resolver plus a few public
  // fallbacks and use whichever one actually answers.
  if (env.mongoUri.startsWith('mongodb+srv://')) {
    const systemServers = await getSystemDnsServers()
    const workingServer = await findWorkingDnsServer([...systemServers, '1.1.1.1', '8.8.8.8', '9.9.9.9'])
    if (workingServer) {
      dns.setServers([workingServer])
    } else {
      console.warn('Could not find a reachable DNS resolver for the mongodb+srv lookup; connection will likely fail.')
    }
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
