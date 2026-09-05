import { Product } from '../models/Product.js'
import { Supplier } from '../models/Supplier.js'
import { PurchaseOrder } from '../models/PurchaseOrder.js'
import { Receiving } from '../models/Receiving.js'
import { SalesOrder } from '../models/SalesOrder.js'
import { Return } from '../models/Return.js'
import { Refund } from '../models/Refund.js'
import { Customer } from '../models/Customer.js'
import { StockTransaction } from '../models/StockTransaction.js'
import { Promotion, Coupon, GiftCard, LoyaltyTransaction, CashierShift } from '../models/Clothing.js'
import { withTransaction } from '../config/db.js'
import { ApiError } from '../utils/ApiError.js'
import { assert, toNumber, toObjectId } from '../validators/assert.js'

const oid = (value, label = 'id') => toObjectId(value, label)
const scoped = (businessId, more = {}) => ({ business: oid(businessId, 'business'), ...more })
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100
const clean = (v) => String(v || '').trim()

export async function listVariants(businessId, query = {}) {
  const products = await Product.find(scoped(businessId, { 'variants.0': { $exists: true } })).sort('name')
  const search = clean(query.search).toLowerCase()
  return products.flatMap((product) => product.variants.map((variant) => ({ productId: String(product._id), productName: product.name, category: product.category, variantId: String(variant._id), ...variant.toObject(), sellingPrice: variant.sellingPrice ?? product.sellingPrice, purchasePrice: variant.purchasePrice ?? product.purchasePrice }))).filter((row) => (!search || `${row.productName} ${row.sku} ${row.barcode}`.toLowerCase().includes(search)) && (!query.size || query.size === 'all' || row.size === query.size) && (!query.color || query.color === 'all' || row.color === query.color) && (!query.stock || query.stock === 'all' || (query.stock === 'out' ? row.currentStock === 0 : query.stock === 'low' ? row.currentStock > 0 && row.currentStock <= row.reorderPoint : row.currentStock > row.reorderPoint)))
}

export async function bulkUpsertVariants(businessId, productId, rows, actor) {
  assert(Array.isArray(rows) && rows.length, 'Add at least one size/color variant.')
  return withTransaction(async (session) => {
    const product = await Product.findOne(scoped(businessId, { _id: oid(productId, 'product') })).session(session)
    if (!product) throw ApiError.notFound('Product not found.')
    const batchSkus = new Set(), batchBarcodes = new Set()
    for (const raw of rows) {
      const size = clean(raw.size), color = clean(raw.color), sku = clean(raw.sku).toUpperCase(), barcode = clean(raw.barcode)
      assert(size && color && sku, 'Size, color and variant SKU are required.')
      assert(!batchSkus.has(sku) && (!barcode || !batchBarcodes.has(barcode)), 'Duplicate variant SKU or barcode in this batch.')
      batchSkus.add(sku); if (barcode) batchBarcodes.add(barcode)
      const same = product.variants.find((v) => String(v._id) === clean(raw.variantId) || (v.size.toLowerCase() === size.toLowerCase() && v.color.toLowerCase() === color.toLowerCase()))
      assert(!product.variants.some((v) => String(v._id) !== String(same?._id || '') && (v.sku === sku || (barcode && v.barcode === barcode))), 'Variant SKU or barcode already exists on this product.')
      const duplicate = await Product.findOne(scoped(businessId, { _id: { $ne: product._id }, $or: [{ 'variants.sku': sku }, ...(barcode ? [{ 'variants.barcode': barcode }, { barcode }] : []), { sku }] })).session(session)
      assert(!duplicate, `SKU or barcode already belongs to another product in this business.`)
      const values = { size, color, sku, barcode, currentStock: toNumber(raw.currentStock || 0, 'Stock', { min: 0, integer: true }), minimumStock: toNumber(raw.minimumStock || 0, 'Minimum stock', { min: 0, integer: true }), reorderPoint: toNumber(raw.reorderPoint || 0, 'Reorder point', { min: 0, integer: true }), targetStock: toNumber(raw.targetStock || 0, 'Target stock', { min: 0, integer: true }), reorderQuantity: toNumber(raw.reorderQuantity || 0, 'Reorder quantity', { min: 0, integer: true }), preferredSupplierId: raw.preferredSupplierId ? oid(raw.preferredSupplierId, 'supplier') : null, replenishmentEnabled: raw.replenishmentEnabled === true, active: raw.active !== false, sellingPrice: raw.sellingPrice === '' || raw.sellingPrice == null ? null : toNumber(raw.sellingPrice, 'Selling price', { min: 0 }), purchasePrice: raw.purchasePrice === '' || raw.purchasePrice == null ? null : toNumber(raw.purchasePrice, 'Purchase price', { min: 0 }), rfidEnabled: raw.rfidEnabled === true, rfidIdentifier: clean(raw.rfidIdentifier) }
      if (same) Object.assign(same, values); else product.variants.push(values)
    }
    product.currentStock = product.variants.reduce((sum, v) => sum + v.currentStock, 0)
    await product.save({ session })
    return { productId: String(product._id), variants: product.variants.map((v) => v.toObject()), updatedBy: actor }
  })
}

export async function changeVariantStock(businessId, productId, variantId, payload, actor) {
  return withTransaction(async (session) => {
    const product = await Product.findOne(scoped(businessId, { _id: oid(productId, 'product'), 'variants._id': oid(variantId, 'variant') })).session(session)
    if (!product) throw ApiError.notFound('Product variant not found.')
    const variant = product.variants.id(variantId), quantity = toNumber(payload.quantity, 'Quantity', { min: 0, integer: true }), previousStock = variant.currentStock
    const type = payload.type
    assert(['stock_in', 'stock_out', 'adjustment', 'sales_return'].includes(type), 'Unsupported variant stock operation.')
    const next = type === 'adjustment' ? quantity : previousStock + (['stock_in', 'sales_return'].includes(type) ? quantity : -quantity)
    assert(next >= 0, `${variant.sku} has only ${previousStock} unit(s).`)
    variant.currentStock = next; product.currentStock = product.variants.reduce((sum, v) => sum + v.currentStock, 0); await product.save({ session })
    const [transaction] = await StockTransaction.create([{ business: product.business, productId: product._id, variantId: variant._id, variantSku: variant.sku, variantSize: variant.size, variantColor: variant.color, type, quantity, previousStock, newStock: next, reason: clean(payload.reason) || 'Variant stock update', createdBy: actor }], { session })
    return { product: product.toJSON(), variant: variant.toObject(), transaction: transaction.toJSON() }
  })
}

export async function resolveBarcode(businessId, value) {
  const code = clean(value); const product = await Product.findOne(scoped(businessId, { $or: [{ barcode: code }, { 'variants.barcode': code }] }))
  if (!product) throw ApiError.notFound('No product or variant found for this barcode.')
  const variant = product.variants.find((v) => v.barcode === code)
  return { product: product.toJSON(), variant: variant ? variant.toObject() : null }
}

export async function replenishment(businessId, query = {}) {
  const openStatuses = ['Draft', 'Pending', 'Approved', 'Ordered', 'Partially Received']
  const [products, suppliers, purchaseOrders, receivings] = await Promise.all([
    Product.find(scoped(businessId, { 'variants.replenishmentEnabled': true })),
    Supplier.find(scoped(businessId)),
    PurchaseOrder.find(scoped(businessId, { status: { $in: openStatuses } })),
    Receiving.find(scoped(businessId)),
  ])
  const supplierMap = new Map(suppliers.map((s) => [String(s._id), s]))
  const receivedByOrderLine = new Map()
  for (const receiving of receivings) for (const item of receiving.items) {
    const key = `${receiving.purchaseOrderId}:${item.productId}:${item.variantId || ''}`
    receivedByOrderLine.set(key, (receivedByOrderLine.get(key) || 0) + item.receivedQuantity)
  }
  const incomingByVariant = new Map(), statusByVariant = new Map()
  for (const order of purchaseOrders) for (const item of order.items) {
    if (!item.variantId) continue
    const lineKey = `${order._id}:${item.productId}:${item.variantId}`
    const remaining = Math.max(0, item.quantity - (receivedByOrderLine.get(lineKey) || 0))
    const variantId = String(item.variantId)
    incomingByVariant.set(variantId, (incomingByVariant.get(variantId) || 0) + remaining)
    if (remaining > 0) statusByVariant.set(variantId, order.status)
  }
  return products.flatMap((p) => p.variants.filter((v) => v.active && v.replenishmentEnabled && v.currentStock <= v.reorderPoint).map((v) => {
    const supplier = supplierMap.get(String(v.preferredSupplierId)), incomingQuantity = incomingByVariant.get(String(v._id)) || 0
    const requiredQuantity = v.reorderQuantity > 0 ? v.reorderQuantity : Math.max(0, v.targetStock - v.currentStock)
    const suggestedQuantity = Math.max(0, requiredQuantity - incomingQuantity)
    return { productId: String(p._id), productName: p.name, variantId: String(v._id), size: v.size, color: v.color, sku: v.sku, currentStock: v.currentStock, minimumStock: v.minimumStock, reorderPoint: v.reorderPoint, targetStock: v.targetStock, reorderQuantity: v.reorderQuantity, incomingQuantity, requiredQuantity, suggestedQuantity, preferredSupplierId: supplier ? String(supplier._id) : '', preferredSupplier: supplier?.supplierName || '', estimatedCost: round2(suggestedQuantity * (v.purchasePrice ?? p.purchasePrice)), status: statusByVariant.get(String(v._id)) || (supplier ? 'Reorder Needed' : 'Preferred supplier required') }
  }).filter((x) => x.suggestedQuantity > 0 && (!query.search || `${x.productName} ${x.sku} ${x.preferredSupplier}`.toLowerCase().includes(clean(query.search).toLowerCase()))))
}

export async function createDraftPO(businessId, payload, actor) {
  return withTransaction(async (session) => {
    const suggestions = await replenishment(businessId); const selected = suggestions.filter((s) => (payload.variantIds || []).includes(s.variantId)); assert(selected.length, 'Select at least one replenishment suggestion.')
    const supplierOverride = clean(payload.supplierId), supplierId = supplierOverride || selected[0].preferredSupplierId; assert(supplierId, 'A preferred supplier is required or select a supplier manually.')
    if (!supplierOverride) assert(selected.every((s) => s.preferredSupplierId === supplierId), 'Create separate purchase orders for different suppliers.')
    const supplier = await Supplier.findOne(scoped(businessId, { _id: oid(supplierId, 'supplier') })).session(session); if (!supplier) throw ApiError.notFound('Supplier not found.'); assert(supplier.status === 'active', 'Select an active supplier.')
    const items = selected.map((s) => ({ productId: oid(s.productId), productName: s.productName, variantId: oid(s.variantId), variantSku: s.sku, variantSize: s.size, variantColor: s.color, quantity: s.suggestedQuantity, purchasePrice: s.suggestedQuantity ? round2(s.estimatedCost / s.suggestedQuantity) : 0, total: s.estimatedCost }))
    const subtotal = round2(items.reduce((n, x) => n + x.total, 0)); const [order] = await PurchaseOrder.create([{ business: oid(businessId), orderNumber: `PO-${Date.now().toString().slice(-8)}`, supplierId: supplier._id, supplierName: supplier.supplierName, items, subtotal, totalAmount: subtotal, status: 'Draft', notes: 'Created from Clothing replenishment suggestions', createdBy: actor }], { session }); return order.toJSON()
  })
}

const registry = { promotions: Promotion, coupons: Coupon, giftCards: GiftCard }
export async function listRecords(kind, businessId, query = {}) { const Model = registry[kind]; if (!Model) throw ApiError.badRequest('Unsupported clothing record.'); const filter = scoped(businessId); if (query.search) filter.$or = (kind === 'promotions' ? ['name'] : ['code', 'customerName']).map((f) => ({ [f]: new RegExp(clean(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })); return (await Model.find(filter).sort('-createdAt')).map((d) => d.toJSON()) }
export async function saveRecord(kind, businessId, payload) { const Model = registry[kind]; if (!Model) throw ApiError.badRequest('Unsupported clothing record.'); const data = { ...payload, business: oid(businessId) }; if (kind === 'giftCards') { data.code = clean(data.code).toUpperCase(); data.currentBalance = toNumber(data.initialValue, 'Initial value', { min: 0 }); data.transactions = [{ type: 'Issue', amount: data.currentBalance, balanceAfter: data.currentBalance, createdAt: new Date() }] } return (await Model.create(data)).toJSON() }
export async function updateRecord(kind, businessId, id, payload) { const Model = registry[kind]; if (!Model) throw ApiError.badRequest('Unsupported clothing record.'); const record = await Model.findOne(scoped(businessId, { _id: oid(id, kind) })); if (!record) throw ApiError.notFound('Clothing record not found.'); const allowed = kind === 'promotions' ? ['name', 'type', 'discountValue', 'minimumQuantity', 'buyQuantity', 'getQuantity', 'productIds', 'categoryNames', 'variantIds', 'startDate', 'endDate', 'active'] : kind === 'coupons' ? ['discountType', 'discountValue', 'minimumOrderValue', 'maximumDiscount', 'validFrom', 'validUntil', 'totalUsageLimit', 'perCustomerUsageLimit', 'productIds', 'categoryNames', 'variantIds', 'active'] : ['expiryDate', 'active', 'customerId', 'customerName']; for (const key of allowed) if (payload[key] !== undefined) record[key] = payload[key]; await record.save(); return record.toJSON() }

export async function loyaltyHistory(businessId, customerId) { const customer = await Customer.findOne(scoped(businessId, { _id: oid(customerId, 'customer') })); if (!customer) throw ApiError.notFound('Customer not found.'); return { balance: customer.loyaltyPoints, transactions: (await LoyaltyTransaction.find(scoped(businessId, { customerId: customer._id })).sort('-createdAt')).map((x) => x.toJSON()) } }
export async function adjustLoyalty(businessId, customerId, payload, actor) { return withTransaction(async (session) => { const customer = await Customer.findOne(scoped(businessId, { _id: oid(customerId, 'customer') })).session(session); if (!customer) throw ApiError.notFound('Customer not found.'); const points = toNumber(payload.points, 'Points', { min: 1, integer: true }); const next = customer.loyaltyPoints + (payload.type === 'Redeem' ? -points : points); assert(next >= 0, 'Insufficient loyalty points.'); customer.loyaltyPoints = next; await customer.save({ session }); const [tx] = await LoyaltyTransaction.create([{ business: customer.business, customerId: customer._id, type: payload.type === 'Redeem' ? 'Redeem' : 'Earn', points, balanceAfter: next, processedBy: actor }], { session }); return tx.toJSON() }) }

export async function startShift(businessId, user, payload) { assert(!await CashierShift.exists(scoped(businessId, { cashierId: user._id, status: 'Open' })), 'Close the current shift first.'); return (await CashierShift.create({ business: oid(businessId), cashierId: user._id, cashierName: user.name || user.email, openingCash: toNumber(payload.openingCash, 'Opening cash', { min: 0 }) })).toJSON() }
export async function shiftSummary(businessId, shift) { const match = scoped(businessId, { cashierId: shift.cashierId, createdAt: { $gte: shift.startedAt, ...(shift.endedAt ? { $lte: shift.endedAt } : {}) } }); const [sales, refunds] = await Promise.all([SalesOrder.find({ ...match, status: 'Completed' }), Refund.find(scoped(businessId, { processedAt: { $gte: shift.startedAt, ...(shift.endedAt ? { $lte: shift.endedAt } : {}) }, status: 'Refunded' }))]); const methods = {}; for (const s of sales) for (const p of s.paymentSummary || []) methods[p.method] = round2((methods[p.method] || 0) + p.amount); const cashRefunds = round2(refunds.filter((r) => (r.resolvedMethod || r.method) === 'Cash').reduce((n, r) => n + r.amount, 0)); return { salesCount: sales.length, grossSales: round2(sales.reduce((n, s) => n + s.totalAmount, 0)), payments: methods, refunds: round2(refunds.reduce((n, r) => n + r.amount, 0)), cashRefunds, expectedClosingCash: round2(shift.openingCash + (methods.Cash || 0) + shift.cashIn - cashRefunds - shift.cashOut) } }
export async function listShifts(businessId) { const shifts = await CashierShift.find(scoped(businessId)).sort('-startedAt'); return Promise.all(shifts.map(async (s) => ({ ...s.toJSON(), summary: await shiftSummary(businessId, s) }))) }
export async function closeShift(businessId, id, payload, actor) { return withTransaction(async (session) => { const shift = await CashierShift.findOne(scoped(businessId, { _id: oid(id, 'shift'), status: 'Open' })).session(session); if (!shift) throw ApiError.notFound('Open shift not found.'); const summary = await shiftSummary(businessId, shift); shift.expectedClosingCash = summary.expectedClosingCash; shift.actualClosingCash = toNumber(payload.actualClosingCash, 'Actual closing cash', { min: 0 }); shift.difference = round2(shift.actualClosingCash - shift.expectedClosingCash); shift.status = 'Closed'; shift.endedAt = new Date(); shift.closedBy = actor; await shift.save({ session }); return { ...shift.toJSON(), summary } }) }
export async function cashMovement(businessId, userId, payload) { const shift = await CashierShift.findOne(scoped(businessId, { cashierId: oid(userId, 'cashier'), status: 'Open' })); if (!shift) throw ApiError.notFound('Start a cashier shift first.'); const amount = toNumber(payload.amount, 'Amount', { min: 0.01 }); assert(['in', 'out'].includes(payload.direction), 'Cash direction must be in or out.'); if (payload.direction === 'in') shift.cashIn = round2(shift.cashIn + amount); else shift.cashOut = round2(shift.cashOut + amount); await shift.save(); return { ...shift.toJSON(), summary: await shiftSummary(businessId, shift) } }

export async function clothingReport(businessId) {
  const [products, sales, returns, promotions, coupons, giftCards, customers, loyalty, suggestions] = await Promise.all([Product.find(scoped(businessId)), SalesOrder.find(scoped(businessId, { status: 'Completed' })), Return.find(scoped(businessId, { type: 'sale', status: 'Completed' })), Promotion.find(scoped(businessId)), Coupon.find(scoped(businessId)), GiftCard.find(scoped(businessId)), Customer.find(scoped(businessId)), LoyaltyTransaction.find(scoped(businessId)), replenishment(businessId)])
  const variants = products.flatMap((product) => product.variants.map((variant) => ({ product, variant })))
  const sold = sales.flatMap((sale) => sale.items.map((item) => ({ ...item.toObject(), orderDate: sale.createdAt })))
  const sumBy = (items, key, quantity = 'quantity') => Object.entries(items.reduce((map, item) => { const label = item[key] || 'Unspecified'; map[label] = (map[label] || 0) + Number(item[quantity] || 0); return map }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  const soldVariantIds = new Set(sold.map((item) => String(item.variantId || '')).filter(Boolean))
  const recentCutoff = Date.now() - 90 * 86400000
  const recentlySoldVariantIds = new Set(sold.filter((item) => new Date(item.orderDate).getTime() >= recentCutoff).map((item) => String(item.variantId || '')).filter(Boolean))
  const productMap = new Map(products.map((product) => [String(product._id), product]))
  const profitability = sold.reduce((map, item) => { const product = productMap.get(String(item.productId)); const variant = product?.variants.id(item.variantId); const revenue = Number(item.total || 0); const cost = Number(variant?.purchasePrice ?? product?.purchasePrice ?? 0) * item.quantity; const key = item.variantSku || item.productName; const row = map.get(key) || { label: key, revenue: 0, cost: 0, margin: 0 }; row.revenue += revenue; row.cost += cost; row.margin = round2(row.revenue - row.cost); map.set(key, row); return map }, new Map())
  const returnBy = (field) => sumBy(returns.map((record) => ({ [field]: record[field], quantity: record.quantity })), field)
  return {
    totalVariants: variants.length, lowStockVariants: variants.filter(({ variant }) => variant.active && variant.currentStock <= variant.reorderPoint).length, outOfStockVariants: variants.filter(({ variant }) => variant.active && variant.currentStock === 0).length,
    stockBySize: sumBy(variants.map(({ variant }) => variant), 'size', 'currentStock'), stockByColor: sumBy(variants.map(({ variant }) => variant), 'color', 'currentStock'), stockByVariant: variants.map(({ product, variant }) => ({ label: `${product.name} / ${variant.color} / ${variant.size}`, value: variant.currentStock })),
    salesBySize: sumBy(sold, 'variantSize'), salesByColor: sumBy(sold, 'variantColor'), salesByVariant: sumBy(sold, 'variantSku'), bestSellingVariants: sumBy(sold, 'variantSku'), bestSellingProducts: sumBy(sold, 'productName'),
    topSellingSize: sumBy(sold, 'variantSize')[0] || null, topSellingColor: sumBy(sold, 'variantColor')[0] || null,
    slowMovingVariants: variants.filter(({ variant }) => variant.currentStock > 0 && soldVariantIds.has(String(variant._id)) && !recentlySoldVariantIds.has(String(variant._id))).map(({ product, variant }) => `${product.name} / ${variant.sku}`), deadStock: variants.filter(({ variant }) => variant.currentStock > 0 && !soldVariantIds.has(String(variant._id))).map(({ product, variant }) => `${product.name} / ${variant.sku}`), replenishment: suggestions,
    returnRate: sold.reduce((n, item) => n + item.quantity, 0) ? round2(returns.reduce((n, record) => n + record.quantity, 0) * 100 / sold.reduce((n, item) => n + item.quantity, 0)) : 0, returnsByProduct: returnBy('productName'), returnsBySize: returnBy('variantSize'), returnsByColor: returnBy('variantColor'), returnsByVariant: returnBy('variantSku'), damagedReturns: returns.filter((record) => record.condition === 'Damaged').reduce((n, record) => n + record.quantity, 0), defectiveReturns: returns.filter((record) => record.condition === 'Defective').reduce((n, record) => n + record.quantity, 0), nonSellableReturnedStock: variants.reduce((n, { variant }) => n + Object.values(variant.nonSellableStock?.toObject?.() || variant.nonSellableStock || {}).reduce((sum, value) => sum + Number(value || 0), 0), 0),
    activePromotions: promotions.filter((promotion) => promotion.active).length, promotionPerformance: promotions.map((promotion) => ({ name: promotion.name, usageCount: promotion.usageCount, discountGranted: promotion.discountGranted })), couponUsage: coupons.map((coupon) => ({ code: coupon.code, usageCount: coupon.usageCount, discountGranted: round2(coupon.usages.reduce((n, use) => n + use.discount, 0)) })), discountTotal: round2(sales.reduce((n, sale) => n + sale.discount + sale.offerDiscount, 0)),
    loyaltyLiability: customers.reduce((n, customer) => n + customer.loyaltyPoints, 0), loyaltyEarned: loyalty.filter((item) => item.type === 'Earn').reduce((n, item) => n + item.points, 0), loyaltyRedeemed: loyalty.filter((item) => item.type === 'Redeem').reduce((n, item) => n + item.points, 0), storeCreditLiability: round2(customers.reduce((n, customer) => n + customer.creditBalance, 0)), giftCardLiability: round2(giftCards.filter((card) => card.active).reduce((n, card) => n + card.currentBalance, 0)), profitability: [...profitability.values()].sort((a, b) => b.margin - a.margin),
  }
}

export const clothingService = { listVariants, bulkUpsertVariants, changeVariantStock, resolveBarcode, replenishment, createDraftPO, listRecords, saveRecord, updateRecord, loyaltyHistory, adjustLoyalty, startShift, listShifts, closeShift, cashMovement, clothingReport }
