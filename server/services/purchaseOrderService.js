import { PurchaseOrder } from '../models/PurchaseOrder.js'
import { Product } from '../models/Product.js'
import { Supplier } from '../models/Supplier.js'
import { ApiError } from '../utils/ApiError.js'
import { toObjectId, toNumber, assert } from '../validators/assert.js'

function scoped(businessId, extra = {}) {
  return { business: toObjectId(businessId, 'business'), ...extra }
}

async function buildItems(businessId, rawItems) {
  assert(Array.isArray(rawItems) && rawItems.length > 0, 'Add at least one product with a valid quantity and price.')
  assert(new Set(rawItems.map((item) => String(item.productId))).size === rawItems.length, 'Each product can appear only once in an order.')
  const productIds = rawItems.map((item) => toObjectId(item.productId, 'product id'))
  const products = await Product.find(scoped(businessId, { _id: { $in: productIds } }))
  const byId = new Map(products.map((product) => [String(product._id), product]))

  return rawItems.map((item) => {
    const product = byId.get(String(item.productId))
    if (!product) throw ApiError.badRequest('One of the selected products does not exist.')
    const quantity = toNumber(item.quantity, 'Quantity', { min: 1 })
    const purchasePrice = toNumber(item.purchasePrice, 'Purchase price', { min: 0 })
    const discount = toNumber(item.discount ?? 0, 'Discount', { min: 0 })
    const tax = toNumber(item.tax ?? 0, 'Tax', { min: 0 })
    const total = Math.max(0, quantity * purchasePrice - discount + tax)
    return { productId: product._id, productName: product.name, quantity, purchasePrice, discount, tax, total }
  })
}

function totals(items, shippingCharges = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.purchasePrice, 0)
  const discount = items.reduce((sum, item) => sum + item.discount, 0)
  const tax = items.reduce((sum, item) => sum + item.tax, 0)
  const shipping = toNumber(shippingCharges || 0, 'Shipping charges', { min: 0 })
  return { subtotal, discount, tax, shippingCharges: shipping, totalAmount: subtotal - discount + tax + shipping }
}

export async function listOrders(businessId, query = {}) {
  const filter = scoped(businessId)
  if (query.status && query.status !== 'all') filter.status = query.status
  if (query.search) {
    const rx = new RegExp(String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    filter.$or = [{ orderNumber: rx }, { supplierName: rx }, { status: rx }]
  }
  const docs = await PurchaseOrder.find(filter).sort('-createdAt')
  return docs.map((doc) => doc.toJSON())
}

export async function getOrder(businessId, id) {
  const doc = await PurchaseOrder.findOne(scoped(businessId, { _id: toObjectId(id, 'order id') }))
  if (!doc) throw ApiError.notFound('Purchase order not found.')
  return doc.toJSON()
}

export async function createOrder(businessId, payload, createdBy) {
  const supplier = await Supplier.findOne(scoped(businessId, { _id: toObjectId(payload.supplierId, 'supplier id') }))
  assert(supplier, 'Select a valid supplier.')
  assert(supplier.status === 'active', 'Add an active supplier before creating a purchase order.')

  const items = await buildItems(businessId, payload.items)
  const now = Date.now()
  const doc = await PurchaseOrder.create({
    business: scoped(businessId).business,
    orderNumber: `PO-${String(now).slice(-6)}`,
    supplierId: supplier._id,
    supplierName: supplier.supplierName,
    items,
    ...totals(items, payload.shippingCharges),
    status: 'Draft',
    paymentStatus: 'Unpaid',
    expectedDeliveryDate: payload.expectedDeliveryDate || '',
    notes: (payload.notes || '').trim(),
    createdBy,
  })
  return doc.toJSON()
}

export async function updateOrder(businessId, id, payload) {
  const doc = await PurchaseOrder.findOne(scoped(businessId, { _id: toObjectId(id, 'order id') }))
  if (!doc) throw ApiError.notFound('Purchase order not found.')
  assert(!['Received', 'Cancelled'].includes(doc.status), `A ${doc.status.toLowerCase()} order cannot be edited.`)

  if (payload.supplierId) {
    const supplier = await Supplier.findOne(scoped(businessId, { _id: toObjectId(payload.supplierId, 'supplier id') }))
    assert(supplier, 'Select a valid supplier.')
    doc.supplierId = supplier._id
    doc.supplierName = supplier.supplierName
  }
  if (payload.items) {
    doc.items = await buildItems(businessId, payload.items)
    Object.assign(doc, totals(doc.items, payload.shippingCharges ?? doc.shippingCharges))
  } else if (payload.shippingCharges !== undefined) {
    Object.assign(doc, totals(doc.items, payload.shippingCharges))
  }
  if (payload.expectedDeliveryDate !== undefined) doc.expectedDeliveryDate = payload.expectedDeliveryDate
  if (payload.notes !== undefined) doc.notes = payload.notes.trim()
  await doc.save()
  return doc.toJSON()
}

export async function setStatus(businessId, id, status) {
  const allowed = ['Draft', 'Pending', 'Approved', 'Ordered', 'Cancelled']
  assert(allowed.includes(status), 'Invalid status change.')
  const doc = await PurchaseOrder.findOne(scoped(businessId, { _id: toObjectId(id, 'order id') }))
  if (!doc) throw ApiError.notFound('Purchase order not found.')
  assert(!['Received', 'Cancelled'].includes(doc.status), `This order is already ${doc.status.toLowerCase()}.`)
  doc.status = status
  await doc.save()
  return doc.toJSON()
}

export const purchaseOrderService = { listOrders, getOrder, createOrder, updateOrder, setStatus }
