/* Quick connectivity test for the MONGODB_URI in server/.env */
import mongoose from 'mongoose'
import { env } from '../config/env.js'

const masked = env.mongoUri.replace(/\/\/([^:]+):[^@]+@/, '//$1:****@')
console.log(`Connecting to: ${masked}`)

try {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 12000 })
  console.log(`MongoDB OK  -  host: ${mongoose.connection.host}  db: ${mongoose.connection.name}`)
  await mongoose.disconnect()
  process.exit(0)
} catch (error) {
  console.error(`MongoDB FAILED  -  ${error.codeName || error.code || ''} ${error.message}`)
  if (/bad auth|Authentication failed/i.test(error.message)) {
    console.error('  -> Wrong database username/password. Fix the user in Atlas > Database Access.')
  } else if (/ENOTFOUND|querySrv|ECONNREFUSED|ETIMEOUT|timed out/i.test(error.message)) {
    console.error('  -> Cannot reach the cluster. Check the host in the URI and Atlas > Network Access (add your IP or 0.0.0.0/0).')
  }
  process.exit(1)
}
