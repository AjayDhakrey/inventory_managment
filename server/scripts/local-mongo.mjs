// Runs a real local MongoDB for development, with data that persists across
// restarts. Used when MongoDB Atlas is unreachable (e.g. outbound port 27017
// blocked by the network) - see server/.env for the matching MONGODB_URI.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoMemoryServer } from 'mongodb-memory-server'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const dbPath = path.join(projectRoot, '.local-data', 'mongo')
const port = 27021

fs.mkdirSync(dbPath, { recursive: true })

const mongod = await MongoMemoryServer.create({
  instance: { port, dbPath, storageEngine: 'wiredTiger', portGeneration: false },
})

console.log(`Local MongoDB running at ${mongod.getUri('inventory_app')}`)
console.log(`Data persists in ${dbPath} - press Ctrl+C to stop.`)

const shutdown = async () => {
  console.log('\nStopping local MongoDB...')
  await mongod.stop({ doCleanup: false })
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
