/**
 * One-time migration / seed.
 *
 *   npm run seed            migrate any records found in server/data/db.json
 *   npm run seed -- --demo  also create a demo business with sample data
 *   npm run seed -- --fresh wipe the collections first
 *
 * After running, the application no longer depends on db.json.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import { connectDatabase, disconnectDatabase } from '../config/db.js'
import { User } from '../models/User.js'
import { Business } from '../models/Business.js'
import { Product } from '../models/Product.js'
import { Supplier } from '../models/Supplier.js'
import { Customer } from '../models/Customer.js'
import { Role, DEFAULT_ROLES } from '../models/Role.js'
import { Member } from '../models/Member.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const dbJsonPath = path.join(here, '..', 'data', 'db.json')

const flags = new Set(process.argv.slice(2))

async function loadLegacy() {
  try {
    return JSON.parse(await readFile(dbJsonPath, 'utf8'))
  } catch {
    return {}
  }
}

async function migrateLegacy(legacy) {
  let migrated = 0
  for (const account of legacy.accounts || []) {
    const exists = await User.findOne({ email: String(account.email).toLowerCase() })
    if (exists) continue
    // db.json stored plaintext passwords - the pre-save hook re-hashes them.
    await User.create({
      email: account.email,
      password: account.password || 'changeme123',
      role: account.role || 'owner',
      name: account.name || String(account.email).split('@')[0],
    })
    migrated += 1
  }
  for (const business of legacy.businesses || []) {
    const owner = await User.findOne({ email: business.ownerEmail }) || (await User.findOne())
    if (!owner) continue
    const created = await Business.create({ ...stripIds(business), owner: owner._id })
    if (!owner.business) {
      owner.business = created._id
      await owner.save()
    }
    await Role.insertMany(DEFAULT_ROLES.map((role) => ({ ...role, business: created._id })))
    migrated += 1
  }
  return migrated
}

function stripIds(record) {
  const rest = { ...record }
  for (const key of ['_id', 'id', 'businessId', 'accountId', 'owner', '__v']) delete rest[key]
  return rest
}

async function seedDemo() {
  const email = 'demo@stockroom.test'
  if (await User.findOne({ email })) {
    console.log('Demo user already exists - skipping demo seed.')
    return
  }
  const user = await User.create({ email, password: 'demo12345', role: 'owner', name: 'Demo Owner' })
  const business = await Business.create({
    name: 'Demo Supply Co', industry: 'retail', businessType: 'retail',
    city: 'New Delhi', country: 'India', currency: 'INR', owner: user._id,
  })
  user.business = business._id
  await user.save()
  await Role.insertMany(DEFAULT_ROLES.map((role) => ({ ...role, business: business._id })))
  await Member.create({ business: business._id, account: user._id, name: 'Demo Owner', email, roleId: 'ROLE-ADMIN' })
  await Product.create([
    { business: business._id, name: 'Classic Canvas Tote', sku: 'TOTE-001', category: 'Accessories', purchasePrice: 16, sellingPrice: 28, currentStock: 8, minimumStock: 10 },
    { business: business._id, name: 'Daily Planner 2024', sku: 'PLAN-014', category: 'Stationery', purchasePrice: 9, sellingPrice: 18, currentStock: 42, minimumStock: 10 },
    { business: business._id, name: 'Ceramic Travel Mug', sku: 'MUG-032', category: 'Drinkware', purchasePrice: 12, sellingPrice: 24, currentStock: 0, minimumStock: 5 },
  ])
  await Supplier.create({ business: business._id, supplierName: 'Sharma Wholesale', phone: '+91 98765 43210', city: 'New Delhi' })
  await Customer.create({ business: business._id, name: 'Priya Sharma', phone: '+91 91234 56789', city: 'New Delhi' })
  console.log(`Demo workspace ready - login: ${email} / demo12345`)
}

async function run() {
  await connectDatabase()

  if (flags.has('--fresh')) {
    console.log('Wiping collections...')
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})))
  }

  const legacy = await loadLegacy()
  const legacyCount = Object.values(legacy).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0)
  if (legacyCount > 0) {
    const migrated = await migrateLegacy(legacy)
    console.log(`Migrated ${migrated} record(s) from db.json.`)
  } else {
    console.log('db.json has no records to migrate.')
  }

  if (flags.has('--demo')) await seedDemo()

  await disconnectDatabase()
  console.log('Seed complete.')
}

run().catch(async (error) => {
  console.error(error)
  await disconnectDatabase()
  process.exit(1)
})
