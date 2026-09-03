import { Notification } from '../models/Notification.js'
import { User } from '../models/User.js'
import { Member } from '../models/Member.js'
import { Role } from '../models/Role.js'
import { Product } from '../models/Product.js'
import { PurchaseOrder } from '../models/PurchaseOrder.js'
import { SalesOrder } from '../models/SalesOrder.js'
import { Payment } from '../models/Payment.js'
import { Receiving } from '../models/Receiving.js'
import { Supplier } from '../models/Supplier.js'
import { ApiError } from '../utils/ApiError.js'
import { toObjectId } from '../validators/assert.js'

const CATEGORY_PERMISSION = { inventory: 'view_inventory', purchases: 'view_inventory', suppliers: 'view_inventory', sales: 'create_order', returns: 'create_order', payments: 'view_reports', users: 'manage_users', system: 'view_dashboard' }
const scoped = (businessId, extra = {}) => ({ business: toObjectId(businessId, 'business'), ...extra })

async function recipientIds(businessId, category) {
  const business = toObjectId(businessId, 'business')
  const users = await User.find({ business }).select('_id email role')
  const members = await Member.find({ business, status: 'active' }).select('account email roleId')
  const roles = await Role.find({ business }).select('roleId permissions')
  const memberByAccount = new Map(members.filter((m) => m.account).map((m) => [String(m.account), m]))
  const memberByEmail = new Map(members.map((m) => [m.email, m]))
  const roleById = new Map(roles.map((r) => [r.roleId, r]))
  const permission = CATEGORY_PERMISSION[category] || 'view_dashboard'
  return users.filter((user) => {
    if (user.role === 'owner') return true
    const member = memberByAccount.get(String(user._id)) || memberByEmail.get(user.email)
    return Boolean(member && roleById.get(member.roleId)?.permissions?.includes(permission))
  }).map((user) => user._id)
}

export async function notifyEvent(businessId, event) {
  const recipients = await recipientIds(businessId, event.category)
  const business = toObjectId(businessId, 'business')
  return Promise.all(recipients.map((recipient) => Notification.findOneAndUpdate(
    { business, recipient, dedupeKey: event.dedupeKey },
    { $setOnInsert: { business, recipient, dedupeKey: event.dedupeKey }, $set: {
      type: event.type, category: event.category, severity: event.severity || 'info', title: event.title, message: event.message,
      relatedEntity: event.relatedEntity || '', relatedEntityId: String(event.relatedEntityId || ''), navigationTarget: event.navigationTarget, resolvedAt: null,
    } },
    { upsert: true, returnDocument: 'after' },
  )))
}

async function syncCondition(businessId, condition, active) {
  if (active) {
    await Notification.updateMany(scoped(businessId, { dedupeKey: condition.dedupeKey, resolvedAt: { $ne: null } }), { $set: { resolvedAt: null, dismissedAt: null, readAt: null, createdAt: new Date() } })
    return notifyEvent(businessId, condition)
  }
  return Notification.updateMany(scoped(businessId, { dedupeKey: condition.dedupeKey, resolvedAt: null }), { $set: { resolvedAt: new Date() } })
}

export async function syncOperationalAlerts(businessId) {
  const business = toObjectId(businessId, 'business')
  const today = new Date().toISOString().slice(0, 10)
  const [products, purchaseOrders, salesOrders, paymentRows, receivings, suppliers] = await Promise.all([
    Product.find({ business }).select('name sku currentStock minimumStock'),
    PurchaseOrder.find({ business }).select('orderNumber supplierId supplierName status paymentStatus totalAmount expectedDeliveryDate createdAt'),
    SalesOrder.find({ business, status: 'Completed', paymentStatus: { $ne: 'Paid' } }).select('orderNumber customerName totalAmount createdAt'),
    Payment.aggregate([{ $match: { business } }, { $group: { _id: '$referenceId', paid: { $sum: '$amount' } } }]),
    Receiving.find({ business }).select('items'), Supplier.find({ business }).select('paymentTerms status'),
  ])
  const paid = new Map(paymentRows.map((p) => [String(p._id), p.paid]))
  const supplierById = new Map(suppliers.map((s) => [String(s._id), s]))
  const terms = { 'Due on receipt': 0, 'Net 7': 7, 'Net 15': 15, 'Net 30': 30, 'Net 60': 60 }
  const addDays = (date, days) => new Date(new Date(date).getTime() + days * 86400000)

  for (const product of products) {
    const threshold = product.minimumStock || 10
    const state = product.currentStock <= 0 ? 'out' : product.currentStock <= threshold ? 'low' : null
    for (const kind of ['out', 'low']) await syncCondition(businessId, {
      dedupeKey: `stock:${product._id}:${kind}`, type: kind === 'out' ? 'OUT_OF_STOCK' : 'LOW_STOCK', category: 'inventory', severity: kind === 'out' ? 'critical' : 'warning',
      title: kind === 'out' ? `${product.name} is out of stock` : `${product.name} reached its reorder level`,
      message: `${product.sku} has ${product.currentStock} units available (reorder level: ${threshold}).`, relatedEntity: 'Product', relatedEntityId: product._id, navigationTarget: 'Products',
    }, state === kind)
  }

  for (const po of purchaseOrders) {
    const supplier = supplierById.get(String(po.supplierId))
    const outstanding = po.totalAmount - (paid.get(String(po._id)) || 0)
    const paymentOverdue = ['Ordered', 'Partially Received', 'Received'].includes(po.status) && supplier?.status !== 'archived' && po.paymentStatus !== 'Paid' && outstanding > 0 && addDays(po.createdAt, terms[supplier?.paymentTerms] ?? 0) < new Date(`${today}T00:00:00Z`)
    await syncCondition(businessId, { dedupeKey: `payment:purchase:${po._id}:overdue`, type: 'PAYMENT_OVERDUE', category: 'payments', severity: 'critical', title: `Supplier payment overdue for ${po.orderNumber}`, message: `${po.supplierName}: ${outstanding.toFixed(2)} remains unpaid.`, relatedEntity: 'PurchaseOrder', relatedEntityId: po._id, navigationTarget: 'Payments' }, paymentOverdue)
    const deliveryLate = /^\d{4}-\d{2}-\d{2}$/.test(po.expectedDeliveryDate) && po.expectedDeliveryDate < today && ['Approved', 'Ordered', 'Partially Received'].includes(po.status)
    await syncCondition(businessId, { dedupeKey: `purchase:${po._id}:delivery-overdue`, type: 'PURCHASE_DELIVERY_OVERDUE', category: 'purchases', severity: 'warning', title: `${po.orderNumber} is past its delivery date`, message: `${po.supplierName} was expected by ${po.expectedDeliveryDate}.`, relatedEntity: 'PurchaseOrder', relatedEntityId: po._id, navigationTarget: 'Purchase Orders' }, deliveryLate)
  }

  for (const so of salesOrders) {
    const outstanding = so.totalAmount - (paid.get(String(so._id)) || 0)
    await syncCondition(businessId, { dedupeKey: `payment:sale:${so._id}:overdue`, type: 'PAYMENT_OVERDUE', category: 'payments', severity: 'warning', title: `Customer payment overdue for ${so.orderNumber}`, message: `${so.customerName}: ${outstanding.toFixed(2)} remains unpaid.`, relatedEntity: 'SalesOrder', relatedEntityId: so._id, navigationTarget: 'Payments' }, outstanding > 0 && addDays(so.createdAt, 14) < new Date(`${today}T00:00:00Z`))
  }

  for (const receiving of receivings) for (const item of receiving.items) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.expiryDate)) continue
    const days = Math.ceil((Date.parse(`${item.expiryDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
    await syncCondition(businessId, { dedupeKey: `expiry:${receiving._id}:${item.productId}`, type: days < 0 ? 'PRODUCT_EXPIRED' : 'PRODUCT_NEAR_EXPIRY', category: 'inventory', severity: days < 0 ? 'critical' : 'warning', title: days < 0 ? 'Received stock has expired' : 'Received stock is near expiry', message: `Batch ${item.batchNumber || 'unlabelled'} ${days < 0 ? `expired ${Math.abs(days)} day(s) ago` : `expires in ${days} day(s)`}.`, relatedEntity: 'Product', relatedEntityId: item.productId, navigationTarget: 'Receiving' }, days <= 30)
  }
}

export async function listNotifications(businessId, userId, query = {}) {
  await syncOperationalAlerts(businessId)
  const filter = scoped(businessId, { recipient: toObjectId(userId, 'user'), dismissedAt: null, resolvedAt: null })
  if (query.unread === 'true') filter.readAt = null
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 30))
  const [docs, unreadCount] = await Promise.all([Notification.find(filter).sort('-createdAt').limit(limit), Notification.countDocuments({ ...filter, readAt: null })])
  const items = docs.map((doc) => {
    const item = doc.toJSON()
    return { ...item, key: item.notificationId, secondary: item.message, navTo: item.navigationTarget }
  })
  const highestSeverity = items.find((item) => !item.readAt)?.severity || null
  return { items, unreadCount, badgeCount: unreadCount, hasPing: unreadCount > 0, highestSeverity, generatedAt: new Date().toISOString() }
}

const userFilter = (businessId, userId, id) => scoped(businessId, { _id: toObjectId(id, 'notification'), recipient: toObjectId(userId, 'user') })
export async function markRead(businessId, userId, id) {
  const doc = await Notification.findOneAndUpdate(userFilter(businessId, userId, id), { $set: { readAt: new Date() } }, { returnDocument: 'after' })
  if (!doc) throw ApiError.notFound('Notification not found.')
  return doc.toJSON()
}
export async function markAllRead(businessId, userId) {
  const result = await Notification.updateMany(scoped(businessId, { recipient: toObjectId(userId, 'user'), readAt: null, dismissedAt: null }), { $set: { readAt: new Date() } })
  return { updated: result.modifiedCount }
}
export async function dismiss(businessId, userId, id) {
  const doc = await Notification.findOneAndUpdate(userFilter(businessId, userId, id), { $set: { dismissedAt: new Date(), readAt: new Date() } }, { returnDocument: 'after' })
  if (!doc) throw ApiError.notFound('Notification not found.')
  return { dismissed: true }
}
