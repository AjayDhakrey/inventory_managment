import { SalesOrder } from '../models/SalesOrder.js'
import { Product } from '../models/Product.js'
import { Customer } from '../models/Customer.js'
import { ApiError } from '../utils/ApiError.js'
import { withTransaction } from '../config/db.js'
import { applyStockChange } from './inventoryService.js'
import { toObjectId, toNumber, assert } from '../validators/assert.js'

function scoped(businessId, extra = {}) {
  return { business: toObjectId(businessId, 'business'), ...extra }
}

async function buildItems(businessId, rawItems) {
  assert(Array.isArray(rawItems) && rawItems.length > 0, 'Add at least one product with a valid quantity and price.')
  assert(new Set(rawItems.map((item) => String(item.productId))).size === rawItems.length, 'Each product can appear only once in an order.')
  const products = await Product.find(scoped(businessId, { _id: { $in: rawItems.map((i) => toObjectId(i.productId, 'product id')) } }))
  const byId = new Map(products.map((product) => [String(product._id), product]))

  return rawItems.map((item) => {
    const product = byId.get(String(item.productId))
    if (!product) throw ApiError.badRequest('One of the selected products does not exist.')
    const quantity = toNumber(item.quantity, 'Quantity', { min: 1 })
    const sellingPrice = toNumber(item.sellingPrice, 'Selling price', { min: 0 })
    const discount = toNumber(item.discount ?? 0, 'Discount', { min: 0 })
    const tax = toNumber(item.tax ?? 0, 'Tax', { min: 0 })
    const total = Math.max(0, quantity * sellingPrice - discount + tax)
    return { productId: product._id, productName: product.name, quantity, sellingPrice, discount, tax, total }
  })
}

function totals(items) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.sellingPrice, 0)
  const discount = items.reduce((sum, item) => sum + item.discount, 0)
  const tax = items.reduce((sum, item) => sum + item.tax, 0)
  return { subtotal, discount, tax, totalAmount: subtotal - discount + tax }
}

export async function listOrders(businessId, query = {}) {
  const filter = scoped(businessId)
  if (query.status && query.status !== 'all') filter.status = query.status
  if (query.search) {
    const rx = new RegExp(String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    filter.$or = [{ orderNumber: rx }, { customerName: rx }, { status: rx }]
  }
  const docs = await SalesOrder.find(filter).sort('-createdAt')
  return docs.map((doc) => doc.toJSON())
}

export async function getOrder(businessId, id) {
  const doc = await SalesOrder.findOne(scoped(businessId, { _id: toObjectId(id, 'order id') }))
  if (!doc) throw ApiError.notFound('Sales order not found.')
  return doc.toJSON()
}

export async function createOrder(businessId, payload, createdBy) {
  const customer = await Customer.findOne(scoped(businessId, { _id: toObjectId(payload.customerId, 'customer id') }))
  assert(customer, 'Add a customer before creating an order.')
  const items = await buildItems(businessId, payload.items)
  const doc = await SalesOrder.create({
    business: scoped(businessId).business,
    orderNumber: `SO-${String(Date.now()).slice(-6)}`,
    customerId: customer._id,
    customerName: customer.name,
    items,
    ...totals(items),
    status: 'Pending',
    paymentStatus: 'Unpaid',
    notes: (payload.notes || '').trim(),
    createdBy,
  })
  return doc.toJSON()
}

export async function updateOrder(businessId, id, payload) {
  const doc = await SalesOrder.findOne(scoped(businessId, { _id: toObjectId(id, 'order id') }))
  if (!doc) throw ApiError.notFound('Sales order not found.')
  assert(!['Completed', 'Cancelled'].includes(doc.status), `A ${doc.status.toLowerCase()} order cannot be edited.`)

  if (payload.customerId) {
    const customer = await Customer.findOne(scoped(businessId, { _id: toObjectId(payload.customerId, 'customer id') }))
    assert(customer, 'Select a valid customer.')
    doc.customerId = customer._id
    doc.customerName = customer.name
  }
  if (payload.items) {
    doc.items = await buildItems(businessId, payload.items)
    Object.assign(doc, totals(doc.items))
  }
  if (payload.notes !== undefined) doc.notes = payload.notes.trim()
  await doc.save()
  return doc.toJSON()
}

export async function completeOrder(businessId, id, createdBy) {
  return withTransaction(async (session) => {
    const doc = await SalesOrder.findOne(scoped(businessId, { _id: toObjectId(id, 'order id') })).session(session)
    if (!doc) throw ApiError.notFound('Sales order not found.')
    if (doc.status === 'Completed') return doc.toJSON()
    assert(doc.status !== 'Cancelled', 'A cancelled order cannot be completed.')

    for (const item of doc.items) {
      const product = await Product.findOne({ business: doc.business, _id: item.productId }).session(session)
      assert(product && product.currentStock >= item.quantity, `Not enough stock for ${item.productName}.`)
    }
    for (const item of doc.items) {
      await applyStockChange(
        {
          businessId,
          productId: item.productId,
          type: 'stock_out',
          quantity: item.quantity,
          reason: 'Completed Sale',
          referenceId: String(doc._id),
          createdBy,
        },
        session,
      )
    }
    doc.status = 'Completed'
    await doc.save({ session })
    return doc.toJSON()
  })
}

export async function cancelOrder(businessId, id) {
  const doc = await SalesOrder.findOne(scoped(businessId, { _id: toObjectId(id, 'order id') }))
  if (!doc) throw ApiError.notFound('Sales order not found.')
  assert(doc.status !== 'Completed', 'A completed order cannot be cancelled.')
  doc.status = 'Cancelled'
  await doc.save()
  return doc.toJSON()
}

export const salesOrderService = { listOrders, getOrder, createOrder, updateOrder, completeOrder, cancelOrder }
