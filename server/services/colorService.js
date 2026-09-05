import { Color } from '../models/Color.js'
import { Product } from '../models/Product.js'
import { ApiError } from '../utils/ApiError.js'
import { assert, requireFields, toObjectId } from '../validators/assert.js'

const normalizeName = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
const cleanName = (value) => String(value || '').trim().replace(/\s+/g, ' ')

function normalizePayload(payload = {}) {
  const out = {}
  if (payload.name !== undefined) {
    out.name = cleanName(payload.name)
    out.normalizedName = normalizeName(payload.name)
  }
  if (payload.hexCode !== undefined) {
    const value = String(payload.hexCode || '').trim().toUpperCase()
    out.hexCode = value && !value.startsWith('#') ? `#${value}` : value
    assert(!out.hexCode || /^#[0-9A-F]{6}$/.test(out.hexCode), 'Color code must be a six-digit hex value such as #000000.')
  }
  if (payload.status !== undefined) {
    assert(['active', 'inactive'].includes(payload.status), 'Color status must be active or inactive.')
    out.status = payload.status
  }
  return out
}

async function importLegacyColors(businessId) {
  const business = toObjectId(businessId, 'business')
  const names = await Product.distinct('color', { business, color: { $type: 'string', $ne: '' } })
  if (!names.length) return
  try {
    await Color.bulkWrite(names.filter((name) => cleanName(name)).map((name) => ({
      updateOne: {
        filter: { business, normalizedName: normalizeName(name) },
        update: { $setOnInsert: { business, name: cleanName(name), normalizedName: normalizeName(name), status: 'active' } },
        upsert: true,
      },
    })), { ordered: false })
  } catch (error) {
    if (error?.code !== 11000) throw error
  }
}

async function list(businessId, query = {}) {
  await importLegacyColors(businessId)
  const business = toObjectId(businessId, 'business')
  const filter = { business }
  if (query.status && query.status !== 'all') filter.status = query.status
  const search = String(query.search || '').trim().toLowerCase()
  const [colors, totals] = await Promise.all([
    Color.find(filter).sort({ status: 1, name: 1 }),
    Product.aggregate([
      { $match: { business, color: { $type: 'string', $ne: '' } } },
      { $group: {
        _id: { $toLower: { $trim: { input: '$color' } } },
        stock: { $sum: '$currentStock' },
        products: { $push: { productId: { $toString: '$_id' }, name: '$name', sku: '$sku', category: '$category', size: '$size', currentStock: '$currentStock' } },
      } },
    ]),
  ])
  const stock = new Map(totals.map((item) => [item._id, item]))
  return colors.map((color) => {
    const group = stock.get(color.normalizedName)
    const products = (group?.products || []).sort((a, b) => a.name.localeCompare(b.name))
    const matchedProducts = search ? products.filter((product) => product.name.toLowerCase().includes(search) || product.sku.toLowerCase().includes(search)) : []
    return { ...color.toJSON(), stockUnits: group?.stock || 0, productCount: products.length, products, matchedProducts }
  }).filter((color) => !search || color.name.toLowerCase().includes(search) || color.matchedProducts.length > 0)
}

async function create(businessId, payload = {}) {
  requireFields(payload, ['name'])
  const data = normalizePayload(payload)
  assert(data.name, 'Color name is required.')
  try {
    const color = await Color.create({ ...data, business: toObjectId(businessId, 'business') })
    return color.toJSON()
  } catch (error) {
    if (error?.code === 11000) throw ApiError.conflict('A color with this name already exists.')
    throw error
  }
}

async function update(businessId, id, payload = {}) {
  const business = toObjectId(businessId, 'business')
  const color = await Color.findOne({ _id: toObjectId(id, 'color id'), business })
  if (!color) throw ApiError.notFound('Color not found.')
  const previousName = color.name
  const data = normalizePayload(payload)
  if (data.name !== undefined) assert(data.name, 'Color name is required.')
  Object.assign(color, data)
  try { await color.save() }
  catch (error) {
    if (error?.code === 11000) throw ApiError.conflict('A color with this name already exists.')
    throw error
  }
  if (data.name && normalizeName(previousName) !== data.normalizedName) {
    await Product.updateMany({ business, color: new RegExp(`^${previousName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }, { $set: { color: color.name } })
  }
  return color.toJSON()
}

export const colorService = { list, create, update }
