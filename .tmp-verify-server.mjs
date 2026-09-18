import { MongoMemoryServer } from 'mongodb-memory-server'

const mongod = await MongoMemoryServer.create()
process.env.MONGODB_URI = mongod.getUri('inventory_app')
process.env.PORT = '4000'
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234'
process.env.NODE_ENV = 'development'
process.env.CLIENT_URL = 'http://localhost:5174'

await import('./server/server.js')

console.log('READY', process.env.MONGODB_URI)
