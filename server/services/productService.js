import { Product } from '../models/Product.js'
import { createCrudService } from './crudService.js'
import { requireFields, toNumber, assert } from '../validators/assert.js'
import { Business } from '../models/Business.js'
import { resolveBusinessCapabilities } from '../../shared/industryConfig.js'

const base = createCrudService(Product, {
  searchFields: ['name', 'sku', 'category', 'brand'],
  label: 'Product',
})

function normalize(payload) {
  const out = { ...payload }
  if (payload.name !== undefined) out.name = String(payload.name).trim()
  if (payload.sku !== undefined) out.sku = String(payload.sku).trim().toUpperCase()
  if (payload.category !== undefined) out.category = String(payload.category).trim()
  for (const key of ['purchasePrice', 'sellingPrice', 'wholesalePrice', 'wholesaleMinQuantity', 'gstRate', 'currentStock', 'minimumStock', 'mrp', 'warrantyMonths', 'weight']) {
    if (payload[key] !== undefined && payload[key] !== '') out[key] = toNumber(payload[key], key, { min: 0 })
  }
  for (const key of ['barcode', 'hsnCode', 'brand', 'genericName', 'manufacturer', 'batchNumber', 'model', 'serialNumber', 'imei', 'size', 'color', 'supplier', 'description']) if (payload[key] !== undefined) out[key] = String(payload[key]).trim()
  for (const key of ['manufacturingDate', 'expiryDate']) if (payload[key] !== undefined) out[key] = payload[key] ? new Date(payload[key]) : null
  return out
}

async function validateConfiguredFields(businessId, payload) {
  const business = await Business.findById(businessId)
  const allowed = new Set(resolveBusinessCapabilities(business?.toJSON() || {}).productFields)
  const productKeys = Object.keys(payload).filter((key) => key !== 'productId')
  assert(productKeys.every((key) => allowed.has(key)), 'One or more product fields are not enabled for this business.')
}

async function create(businessId, payload) {
  await validateConfiguredFields(businessId, payload)
  requireFields(payload, ['name', 'sku', 'category', 'sellingPrice'])
  const data = normalize(payload)
  assert(Number.isFinite(data.sellingPrice), 'Selling price is required.')
  return base.create(businessId, data)
}

async function update(businessId, id, payload) {
  await validateConfiguredFields(businessId, payload)
  return base.update(businessId, id, normalize(payload))
}

export const productService = { ...base, create, update }
