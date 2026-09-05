import mongoose from 'mongoose'
import { Return } from '../models/Return.js'
import { Refund } from '../models/Refund.js'
import { SalesOrder } from '../models/SalesOrder.js'
import { PurchaseOrder } from '../models/PurchaseOrder.js'
import { Receiving } from '../models/Receiving.js'
import { Product } from '../models/Product.js'
import { Payment } from '../models/Payment.js'
import { Customer } from '../models/Customer.js'
import { StockTransaction } from '../models/StockTransaction.js'
import { StoreCreditTransaction } from '../models/Clothing.js'
import { ApiError } from '../utils/ApiError.js'
import { withTransaction } from '../config/db.js'
import { applyStockChange } from './inventoryService.js'
import { toObjectId, toNumber, assert } from '../validators/assert.js'

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100
const scoped = (businessId, extra = {}) => ({ business: toObjectId(businessId, 'business'), ...extra })
const REASONS = ['Damaged product', 'Defective product', 'Incorrect product', 'Customer changed mind', 'Size/Fit issue', 'Other']
const CONDITIONS = ['Sellable', 'Damaged', 'Defective', 'Opened / Used', 'Other']
const REFUND_METHODS = ['Original Payment Method', 'Cash', 'UPI', 'QR', 'Card', 'Debit Card', 'Credit Card', 'Bank transfer', 'Store Credit', 'Customer Balance/Credit', 'Other']
const BUCKET_BY_CONDITION = { Sellable: 'sellable', Damaged: 'damaged', Defective: 'defective', 'Opened / Used': 'openedUsed', Other: 'other' }

async function paymentTotal(businessId, orderId, session) {
  const aggregate = Payment.aggregate([
    { $match: { business: toObjectId(businessId, 'business'), referenceId: toObjectId(orderId, 'order id'), type: 'sale' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ])
  if (session) aggregate.session(session)
  const result = await aggregate
  return round2(result[0]?.total || 0)
}

async function refundTotals(businessId, returnId, session) {
  const query = Refund.find(scoped(businessId, { returnId: toObjectId(returnId, 'return id') })).sort('createdAt')
  if (session) query.session(session)
  const refunds = await query
  return {
    refunds,
    refunded: round2(refunds.filter((item) => item.status === 'Refunded').reduce((sum, item) => sum + item.amount, 0)),
    reserved: round2(refunds.filter((item) => ['Pending', 'Refunded'].includes(item.status)).reduce((sum, item) => sum + item.amount, 0)),
  }
}

function updateRefundState(record, refunds) {
  const refunded = round2(refunds.filter((item) => item.status === 'Refunded').reduce((sum, item) => sum + item.amount, 0))
  const pending = refunds.some((item) => item.status === 'Pending')
  const failed = refunds.some((item) => item.status === 'Failed')
  record.refundAmount = refunded
  record.remainingRefund = round2(Math.max(0, record.refundRequired - refunded))
  record.refundMethod = refunds.filter((item) => item.status === 'Refunded').map((item) => item.resolvedMethod || item.method).join(', ')
  record.refundStatus = record.refundRequired <= 0 ? 'Not Required' : refunded >= record.refundRequired - 0.001 ? 'Refunded' : refunded > 0 ? 'Partially Refunded' : pending ? 'Pending' : failed ? 'Failed' : 'Pending'
}

async function decorateReturns(businessId, docs) {
  if (!docs.length) return []
  const refunds = await Refund.find(scoped(businessId, { returnId: { $in: docs.map((doc) => doc._id) } })).sort('createdAt')
  const byReturn = new Map()
  for (const refund of refunds) byReturn.set(String(refund.returnId), [...(byReturn.get(String(refund.returnId)) || []), refund.toJSON()])
  return docs.map((doc) => ({ ...doc.toJSON(), refunds: byReturn.get(String(doc._id)) || [] }))
}

export async function listReturns(businessId, query = {}) {
  const filter = scoped(businessId)
  if (query.type) filter.type = query.type
  if (query.status && query.status !== 'all') filter.status = query.status
  if (query.refundStatus && query.refundStatus !== 'all') filter.refundStatus = query.refundStatus
  if (query.reason && query.reason !== 'all') filter.reason = query.reason
  if (query.condition && query.condition !== 'all') filter.condition = query.condition
  if (query.refundMethod && query.refundMethod !== 'all') filter.refundMethod = new RegExp(String(query.refundMethod).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  if (query.dateFrom || query.dateTo) filter.createdAt = { ...(query.dateFrom ? { $gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}), ...(query.dateTo ? { $lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}) }
  if (query.search) {
    const term = String(query.search).trim()
    const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    filter.$or = [{ orderNumber: rx }, { productName: rx }, { productSku: rx }, { customerName: rx }, { processedBy: rx }]
    if (mongoose.isValidObjectId(term)) filter.$or.push({ _id: toObjectId(term, 'return id') })
  }
  const docs = await Return.find(filter).sort('-createdAt').limit(Math.min(500, Number(query.limit) || 200))
  return decorateReturns(businessId, docs)
}

export async function getReturn(businessId, id) {
  const record = await Return.findOne(scoped(businessId, { _id: toObjectId(id, 'return id') }))
  if (!record) throw ApiError.notFound('Return not found.')
  return (await decorateReturns(businessId, [record]))[0]
}

export async function listEligibleOrders(businessId, query = {}) {
  const business = toObjectId(businessId, 'business')
  const filter = { business, status: 'Completed' }
  if (query.search) {
    const rx = new RegExp(String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    filter.$or = [{ orderNumber: rx }, { invoiceNumber: rx }, { customerName: rx }]
  }
  const orders = await SalesOrder.find(filter).sort('-createdAt').limit(250)
  const orderIds = orders.map((order) => order._id)
  const productIds = [...new Set(orders.flatMap((order) => order.items.map((item) => String(item.productId))))]
  const [payments, previousReturns, products] = await Promise.all([
    Payment.find({ business, type: 'sale', referenceId: { $in: orderIds } }),
    Return.find({ business, type: 'sale', orderId: { $in: orderIds }, status: { $ne: 'Cancelled' } }),
    Product.find({ business, _id: { $in: productIds } }),
  ])
  const productMap = new Map(products.map((product) => [String(product._id), product]))
  return orders.map((order) => {
    const orderPayments = payments.filter((payment) => String(payment.referenceId) === String(order._id))
    const amountPaidActual = round2(orderPayments.reduce((sum, payment) => sum + payment.amount, 0))
    const outstandingActual = round2(Math.max(0, order.totalAmount - amountPaidActual - (order.returnAdjustmentAmount || 0)))
    return {
      ...order.toJSON(), amountPaidActual, outstandingActual,
      originalPaymentMethods: [...new Set(orderPayments.map((payment) => payment.paymentMethod))],
      items: order.items.map((item) => {
        const product = productMap.get(String(item.productId))
        const alreadyReturned = previousReturns.filter((record) => String(record.orderId) === String(order._id) && String(record.productId) === String(item.productId) && String(record.variantId || '') === String(item.variantId || '')).reduce((sum, record) => sum + record.quantity, 0)
        return { ...item.toObject(), productId: String(item.productId), sku: item.variantSku || product?.sku || '', size: item.variantSize || product?.size || '', color: item.variantColor || product?.color || '', unit: product?.unit || 'piece', alreadyReturned, returnableQuantity: Math.max(0, item.quantity - alreadyReturned) }
      }),
    }
  }).filter((order) => order.items.some((item) => item.returnableQuantity > 0))
}

async function createPurchaseReturn(businessId, payload, processedBy, session) {
  const order = await PurchaseOrder.findOne(scoped(businessId, { _id: toObjectId(payload.orderId, 'order id') })).session(session)
  assert(order && ['Partially Received', 'Received'].includes(order.status), 'Only received purchase stock can be returned.')
  const orderedItem = order.items.find((item) => String(item.productId) === String(payload.productId))
  assert(orderedItem, 'Select a product that belongs to the order.')
  const quantity = toNumber(payload.quantity, 'Quantity', { min: 1, integer: true })
  const previous = await Return.find(scoped(businessId, { type: 'purchase', orderId: order._id, productId: orderedItem.productId, status: 'Completed' })).session(session)
  const receivings = await Receiving.find(scoped(businessId, { purchaseOrderId: order._id })).session(session)
  const received = receivings.reduce((sum, receipt) => sum + receipt.items.filter((item) => String(item.productId) === String(orderedItem.productId)).reduce((lineSum, item) => lineSum + item.acceptedQuantity, 0), 0)
  assert(quantity <= received - previous.reduce((sum, item) => sum + item.quantity, 0), 'Return quantity exceeds received stock.')
  const [record] = await Return.create([{ business: order.business, type: 'purchase', orderId: order._id, orderModel: 'PurchaseOrder', orderNumber: order.orderNumber, productId: orderedItem.productId, productName: orderedItem.productName, quantity, reason: REASONS.includes(payload.reason) ? payload.reason : 'Other', condition: 'Sellable', status: 'Completed', refundAmount: toNumber(payload.refundAmount || 0, 'Refund amount', { min: 0 }), refundStatus: 'Not Required', processedBy, completedAt: new Date() }], { session })
  await applyStockChange({ businessId, productId: orderedItem.productId, type: 'purchase_return', quantity, reason: 'Purchase Return', referenceId: String(record._id), createdBy: processedBy }, session)
  return record.toJSON()
}

export async function createReturn(businessId, payload, processedBy) {
  const type = payload.type === 'purchase' ? 'purchase' : 'sale'
  if (payload.idempotencyKey) {
    const existing = await Return.findOne(scoped(businessId, { idempotencyKey: String(payload.idempotencyKey) }))
    if (existing) return getReturn(businessId, existing._id)
  }
  return withTransaction(async (session) => {
    if (type === 'purchase') return createPurchaseReturn(businessId, payload, processedBy, session)
    const order = await SalesOrder.findOne(scoped(businessId, { _id: toObjectId(payload.orderId, 'order id') })).session(session)
    assert(order && order.status === 'Completed', 'Only completed sales can be returned.')
    const item = order.items.find((line) => String(line.productId) === String(payload.productId) && (!payload.variantId || String(line.variantId || '') === String(payload.variantId)))
    assert(item, 'Select a product that belongs to the order.')
    const product = await Product.findOne(scoped(businessId, { _id: item.productId })).session(session)
    assert(product, 'The sold product no longer exists.')
    const fractional = ['kg', 'gram', 'litre'].includes(product.unit)
    const quantity = toNumber(payload.quantity, 'Quantity', { min: 0.000001, integer: !fractional })
    const previousReturns = await Return.find(scoped(businessId, { type: 'sale', orderId: order._id, productId: item.productId, variantId: item.variantId || null, status: { $ne: 'Cancelled' } })).session(session)
    const alreadyReturned = previousReturns.reduce((sum, record) => sum + record.quantity, 0)
    assert(quantity <= item.quantity - alreadyReturned + 1e-9, `Only ${Math.max(0, item.quantity - alreadyReturned)} unit(s) remain returnable.`)
    const reason = REASONS.includes(payload.reason) ? payload.reason : 'Other'
    const condition = CONDITIONS.includes(payload.condition) ? payload.condition : 'Sellable'
    assert(reason !== 'Other' || String(payload.reasonDetails || '').trim(), 'Enter a return reason when Other is selected.')
    const lineTotal = item.total > 0 ? item.total : Math.max(0, item.quantity * item.sellingPrice - (item.discount || 0) + (item.tax || 0))
    const returnValue = round2(lineTotal * quantity / item.quantity)
    const paid = await paymentTotal(businessId, order._id, session)
    const outstandingBefore = round2(Math.max(0, order.totalAmount - paid - (order.returnAdjustmentAmount || 0)))
    const outstandingAdjustment = round2(Math.min(returnValue, outstandingBefore))
    const refundRequired = round2(Math.max(0, returnValue - outstandingAdjustment))
    const bucket = BUCKET_BY_CONDITION[condition]
    let record
    try {
      ;[record] = await Return.create([{
        business: order.business, type: 'sale', orderId: order._id, orderModel: 'SalesOrder', orderNumber: order.orderNumber,
        customerId: order.customerId, customerName: order.customerName, productId: item.productId, productName: item.productName,
        productSku: item.variantSku || product.sku, productVariant: [item.variantSize || product.size, item.variantColor || product.color].filter(Boolean).join(' / '), variantId: item.variantId || null, variantSku: item.variantSku || '', variantSize: item.variantSize || '', variantColor: item.variantColor || '', quantity,
        soldQuantity: item.quantity, unitSellingPrice: item.sellingPrice, lineDiscount: round2((item.discount || 0) * quantity / item.quantity),
        lineTax: round2((item.tax || 0) * quantity / item.quantity), returnValue, outstandingBefore, outstandingAdjustment,
        refundRequired, remainingRefund: refundRequired, refundStatus: refundRequired > 0 ? 'Pending' : 'Not Required',
        reason, reasonDetails: String(payload.reasonDetails || '').trim(), condition, inventoryAction: bucket,
        status: 'Completed', processedBy, completedAt: new Date(), idempotencyKey: String(payload.idempotencyKey || ''),
      }], { session })
    } catch (error) {
      if (error?.code === 11000 && payload.idempotencyKey) return Return.findOne(scoped(businessId, { idempotencyKey: String(payload.idempotencyKey) })).session(session)
      throw error
    }

    const variant = item.variantId ? product.variants.id(item.variantId) : null
    if (variant && bucket === 'sellable') {
      const previousStock = variant.currentStock; variant.currentStock += quantity; product.currentStock = product.variants.reduce((sum, v) => sum + v.currentStock, 0); await product.save({ session }); await StockTransaction.create([{ business: order.business, productId: product._id, variantId: variant._id, variantSku: variant.sku, variantSize: variant.size, variantColor: variant.color, type: 'sales_return', stockBucket: 'sellable', quantity, previousStock, newStock: variant.currentStock, reason: `Sales Return · ${condition}`, referenceId: String(record._id), createdBy: processedBy }], { session })
    } else if (variant) {
      const previousStock = variant.currentStock; variant.nonSellableStock[bucket] = Number(variant.nonSellableStock?.[bucket] || 0) + quantity; await product.save({ session }); await StockTransaction.create([{ business: order.business, productId: product._id, variantId: variant._id, variantSku: variant.sku, variantSize: variant.size, variantColor: variant.color, type: 'non_sellable_return', stockBucket: bucket, quantity, previousStock, newStock: previousStock, reason: `Sales Return · ${condition}`, referenceId: String(record._id), createdBy: processedBy }], { session })
    } else if (bucket === 'sellable') {
      await applyStockChange({ businessId, productId: item.productId, type: 'sales_return', quantity, reason: `Sales Return · ${condition}`, referenceId: String(record._id), createdBy: processedBy }, session)
    } else {
      const previousStock = product.currentStock
      product.nonSellableStock[bucket] = Number(product.nonSellableStock?.[bucket] || 0) + quantity
      await product.save({ session })
      await StockTransaction.create([{ business: order.business, productId: product._id, type: 'non_sellable_return', stockBucket: bucket, quantity, previousStock, newStock: previousStock, reason: `Sales Return · ${condition}`, referenceId: String(record._id), createdBy: processedBy }], { session })
    }

    order.returnedValue = round2((order.returnedValue || 0) + returnValue)
    order.returnAdjustmentAmount = round2((order.returnAdjustmentAmount || 0) + outstandingAdjustment)
    order.balanceDue = round2(Math.max(0, outstandingBefore - outstandingAdjustment))
    const netPayable = round2(Math.max(0, order.totalAmount - order.returnedValue))
    order.paymentStatus = paid >= netPayable - 0.001 ? 'Paid' : paid > 0 ? 'Partially Paid' : 'Unpaid'
    await order.save({ session })
    if (order.customerId) {
      const customer = await Customer.findOne(scoped(businessId, { _id: order.customerId })).session(session)
      if (customer) {
        customer.outstandingBalance = round2(Math.max(0, (customer.outstandingBalance || 0) - outstandingAdjustment))
        customer.totalPurchases = round2(Math.max(0, (customer.totalPurchases || 0) - returnValue))
        await customer.save({ session })
      }
    }
    return { ...record.toJSON(), refunds: [] }
  })
}

async function originalMethodAllocations(businessId, orderId, amount, session) {
  const payments = await Payment.find(scoped(businessId, { type: 'sale', referenceId: toObjectId(orderId, 'order id') })).sort('createdAt').session(session)
  const previous = await Refund.find(scoped(businessId, { orderId: toObjectId(orderId, 'order id'), status: 'Refunded' })).session(session)
  const used = new Map()
  for (const refund of previous) for (const allocation of refund.allocations || []) used.set(allocation.method, round2((used.get(allocation.method) || 0) + allocation.amount))
  const available = new Map()
  for (const payment of payments) available.set(payment.paymentMethod, round2((available.get(payment.paymentMethod) || 0) + payment.amount))
  let remaining = amount
  const allocations = []
  for (const [method, total] of available) {
    const allocation = round2(Math.min(remaining, Math.max(0, total - (used.get(method) || 0))))
    if (allocation > 0) allocations.push({ method, amount: allocation })
    remaining = round2(remaining - allocation)
  }
  assert(remaining <= 0.001, 'The original payments do not have enough refundable value.')
  return allocations
}

async function applySuccessfulRefund(businessId, refund, record, session) {
  const order = await SalesOrder.findOne(scoped(businessId, { _id: record.orderId })).session(session)
  assert(order, 'Sales order not found.')
  const paid = await paymentTotal(businessId, order._id, session)
  assert((order.refundedAmount || 0) + refund.amount <= paid + 0.001, 'Refund exceeds the money received from the customer.')
  order.refundedAmount = round2((order.refundedAmount || 0) + refund.amount)
  await order.save({ session })
  if (['Store Credit', 'Customer Balance/Credit'].includes(refund.method)) {
    assert(record.customerId, 'Store credit requires a customer account.')
    const customer = await Customer.findOne(scoped(businessId, { _id: record.customerId })).session(session)
    assert(customer, 'Customer account was not found.')
    customer.creditBalance = round2((customer.creditBalance || 0) + refund.amount)
    await customer.save({ session })
    await StoreCreditTransaction.create([{ business: customer.business, customerId: customer._id, orderId: record.orderId, refundId: refund._id, type: 'Credit', amount: refund.amount, balanceAfter: customer.creditBalance, processedBy: refund.processedBy }], { session })
  }
  refund.processedAt = new Date()
}

export async function createRefund(businessId, returnId, payload, processedBy, permissions = []) {
  return withTransaction(async (session) => {
    const record = await Return.findOne(scoped(businessId, { _id: toObjectId(returnId, 'return id'), type: 'sale' })).session(session)
    assert(record && record.status === 'Completed', 'Only a completed sales return can be refunded.')
    assert(record.refundRequired > 0, 'This return does not require a refund.')
    const amount = toNumber(payload.amount, 'Refund amount', { min: 0.01 })
    const totals = await refundTotals(businessId, record._id, session)
    assert(totals.reserved + amount <= record.refundRequired + 0.001, `Only ${round2(record.refundRequired - totals.reserved)} remains refundable.`)
    const availableForThisRefund = round2(record.refundRequired - totals.reserved)
    assert(Math.abs(amount - availableForThisRefund) < 0.001 || permissions.includes('adjust_refunds'), 'Missing required permission: adjust_refunds.')
    const method = REFUND_METHODS.includes(payload.method) ? payload.method : 'Original Payment Method'
    const status = ['Pending', 'Refunded', 'Failed'].includes(payload.status) ? payload.status : 'Pending'
    const allocations = method === 'Original Payment Method' ? await originalMethodAllocations(businessId, record.orderId, amount, session) : [{ method, amount }]
    const [refund] = await Refund.create([{ business: record.business, returnId: record._id, orderId: record.orderId, customerId: record.customerId, customerName: record.customerName, amount, method, resolvedMethod: allocations.map((item) => item.method).join(' + '), allocations, status, transactionReference: String(payload.transactionReference || '').trim(), notes: String(payload.notes || '').trim(), processedBy }], { session })
    if (status === 'Refunded') await applySuccessfulRefund(businessId, refund, record, session)
    const refreshed = [...totals.refunds, refund]
    updateRefundState(record, refreshed)
    await Promise.all([record.save({ session }), refund.save({ session })])
    return { return: record.toJSON(), refund: refund.toJSON() }
  })
}

export async function updateRefund(businessId, returnId, refundId, payload, processedBy) {
  return withTransaction(async (session) => {
    const record = await Return.findOne(scoped(businessId, { _id: toObjectId(returnId, 'return id') })).session(session)
    const refund = await Refund.findOne(scoped(businessId, { _id: toObjectId(refundId, 'refund id'), returnId: record?._id })).session(session)
    if (!record || !refund) throw ApiError.notFound('Refund transaction not found.')
    assert(refund.status !== 'Refunded', 'A completed refund cannot be changed.')
    const status = ['Pending', 'Refunded', 'Failed', 'Cancelled'].includes(payload.status) ? payload.status : refund.status
    refund.status = status; refund.processedBy = processedBy
    const totals = await refundTotals(businessId, record._id, session)
    const reservedByOthers = totals.refunds.filter((item) => String(item._id) !== String(refund._id) && ['Pending', 'Refunded'].includes(item.status)).reduce((sum, item) => sum + item.amount, 0)
    assert(status !== 'Refunded' || reservedByOthers + refund.amount <= record.refundRequired + 0.001, 'Refund exceeds the remaining refundable value.')
    if (status === 'Refunded') await applySuccessfulRefund(businessId, refund, record, session)
    updateRefundState(record, totals.refunds.map((item) => String(item._id) === String(refund._id) ? refund : item))
    await Promise.all([record.save({ session }), refund.save({ session })])
    return { return: record.toJSON(), refund: refund.toJSON() }
  })
}

export async function cancelReturn(businessId, id, processedBy) {
  const record = await Return.findOne(scoped(businessId, { _id: toObjectId(id, 'return id') }))
  if (!record) throw ApiError.notFound('Return not found.')
  assert(record.status === 'Pending', 'Only pending returns can be cancelled.')
  record.status = 'Cancelled'; record.refundStatus = 'Cancelled'; record.cancelledAt = new Date(); record.processedBy = processedBy
  await record.save()
  return record.toJSON()
}

export const returnService = { listReturns, getReturn, listEligibleOrders, createReturn, createRefund, updateRefund, cancelReturn }
