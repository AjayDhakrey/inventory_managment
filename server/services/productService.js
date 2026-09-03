import { Product } from '../models/Product.js'
import { createCrudService } from './crudService.js'
import { requireFields, toNumber, assert } from '../validators/assert.js'

const base = createCrudService(Product, {
  searchFields: ['name', 'sku', 'category', 'brand'],
  label: 'Product',
})

function normalize(payload) {
  const out = { ...payload }
  if (payload.name !== undefined) out.name = String(payload.name).trim()
  if (payload.sku !== undefined) out.sku = String(payload.sku).trim().toUpperCase()
  if (payload.category !== undefined) out.category = String(payload.category).trim()
  for (const key of ['purchasePrice', 'sellingPrice', 'wholesalePrice', 'wholesaleMinQuantity', 'gstRate', 'currentStock', 'minimumStock']) {
    if (payload[key] !== undefined && payload[key] !== '') out[key] = toNumber(payload[key], key, { min: 0 })
  }
  for (const key of ['barcode', 'hsnCode']) if (payload[key] !== undefined) out[key] = String(payload[key]).trim()
  return out
}

async function create(businessId, payload) {
  requireFields(payload, ['name', 'sku', 'category', 'sellingPrice'])
  const data = normalize(payload)
  assert(Number.isFinite(data.sellingPrice), 'Selling price is required.')
  return base.create(businessId, data)
}

async function update(businessId, id, payload) {
  return base.update(businessId, id, normalize(payload))
}

export const productService = { ...base, create, update }
