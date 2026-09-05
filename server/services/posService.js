import { Business } from '../models/Business.js'
import { Product } from '../models/Product.js'
import { Customer } from '../models/Customer.js'
import { SalesOrder } from '../models/SalesOrder.js'
import { Payment } from '../models/Payment.js'
import { Promotion, Coupon, GiftCard, LoyaltyTransaction, StoreCreditTransaction } from '../models/Clothing.js'
import { StockTransaction } from '../models/StockTransaction.js'
import { withTransaction } from '../config/db.js'
import { applyStockChange } from './inventoryService.js'
import { ApiError } from '../utils/ApiError.js'
import { toObjectId, toNumber, assert, isEmail } from '../validators/assert.js'

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100
const scoped = (businessId, extra = {}) => ({ business: toObjectId(businessId, 'business'), ...extra })
const PAYMENT_METHODS = ['Cash', 'UPI', 'QR', 'Card', 'Debit Card', 'Credit Card', 'Bank transfer', 'Credit', 'Pay Later', 'Store Credit', 'Gift Card', 'Other']

export async function listCustomers(businessId, query = {}) {
  const filter = scoped(businessId, { status: 'active' })
  if (query.search) filter.$or = ['name', 'phone', 'email', 'gstin'].map((field) => ({ [field]: { $regex: String(query.search).slice(0, 100), $options: 'i' } }))
  const customers = await Customer.find(filter).sort('name').limit(Math.min(500, Number(query.limit) || 250))
  return customers.map((customer) => customer.toJSON())
}

async function resolveCustomer(businessId, payload, session) {
  if (payload.customerId) {
    const customer = await Customer.findOne(scoped(businessId, { _id: toObjectId(payload.customerId, 'customer id'), status: 'active' })).session(session)
    if (!customer) throw ApiError.badRequest('Selected customer was not found.')
    return customer
  }
  if (payload.newCustomer?.name) {
    assert(!payload.newCustomer.email || isEmail(payload.newCustomer.email), 'Enter a valid customer email.')
    const [customer] = await Customer.create([{ business: toObjectId(businessId, 'business'), name: payload.newCustomer.name.trim(), phone: (payload.newCustomer.phone || '').trim(), email: (payload.newCustomer.email || '').trim().toLowerCase(), state: (payload.newCustomer.state || '').trim(), gstin: (payload.newCustomer.gstin || '').trim().toUpperCase(), customerType: payload.billingType === 'wholesale' ? 'wholesale' : 'retail', status: 'active' }], { session })
    return customer
  }
  return null
}

function invoiceNumber(business) {
  const prefix = String(business.settings?.invoicePrefix || 'INV').replace(/[^A-Z0-9-]/gi, '').toUpperCase() || 'INV'
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  return `${prefix}-${date}-${Date.now().toString().slice(-7)}`
}

export async function checkout(businessId, payload, actor, permissions = []) {
  return withTransaction(async (session) => {
    const business = await Business.findById(toObjectId(businessId, 'business')).session(session)
    if (!business) throw ApiError.notFound('Business not found.')
    assert(Array.isArray(payload.items) && payload.items.length > 0, 'Add at least one product to the cart.')
    const billingType = payload.billingType === 'wholesale' ? 'wholesale' : 'retail'
    const customer = await resolveCustomer(businessId, payload, session)
    assert(billingType !== 'wholesale' || customer, 'Select or create a customer for wholesale billing.')

    const ids = payload.items.map((item) => toObjectId(item.productId, 'product id'))
    const products = await Product.find(scoped(businessId, { _id: { $in: ids } })).session(session)
    const byId = new Map(products.map((product) => [String(product._id), product]))
    assert(products.length === new Set(ids.map(String)).size, 'One or more cart products are invalid.')

    const items = payload.items.map((raw) => {
      const product = byId.get(String(raw.productId))
      const quantity = toNumber(raw.quantity, 'Quantity', { min: 1, integer: true })
      const variant = raw.variantId ? product.variants.id(toObjectId(raw.variantId, 'variant id')) : null
      assert(!raw.variantId || variant?.active, `Selected ${product.name} variant is unavailable.`)
      const available = variant ? variant.currentStock : product.currentStock
      assert(available >= quantity, `${variant?.sku || product.name} has only ${available} unit(s) in stock.`)
      const standardPrice = variant?.sellingPrice ?? (billingType === 'wholesale' && product.wholesalePrice > 0 && quantity >= product.wholesaleMinQuantity ? product.wholesalePrice : product.sellingPrice)
      const requestedPrice = raw.unitPrice === undefined || raw.unitPrice === '' ? standardPrice : toNumber(raw.unitPrice, 'Unit price', { min: 0 })
      const mayOverride = business.settings?.allowPriceOverride === true && permissions.includes('override_pos_price')
      assert(round2(requestedPrice) === round2(standardPrice) || mayOverride, `Price override is not allowed for ${product.name}.`)
      const gross = round2(requestedPrice * quantity)
      const discount = Math.min(gross, round2(toNumber(raw.discount || 0, 'Line discount', { min: 0 })))
      const gstRate = business.settings?.taxEnabled === false ? 0 : (product.gstRate || business.settings?.defaultGstRate || 0)
      return { productId: product._id, productName: product.name, variantId: variant?._id || null, variantSku: variant?.sku || '', variantSize: variant?.size || product.size || '', variantColor: variant?.color || product.color || '', barcode: variant?.barcode || product.barcode || '', quantity, sellingPrice: requestedPrice, discount, gstRate, hsnCode: product.hsnCode || '', gross, taxableAmount: round2(gross - discount) }
    })

    const subtotal = round2(items.reduce((sum, item) => sum + item.gross, 0))
    const lineDiscount = round2(items.reduce((sum, item) => sum + item.discount, 0))
    const afterLines = round2(subtotal - lineDiscount)
    const global = payload.discount || {}
    const requestedGlobal = global.type === 'percent' ? afterLines * Math.min(100, Math.max(0, Number(global.value) || 0)) / 100 : Math.max(0, Number(global.value) || 0)
    let discount = round2(Math.min(afterLines, requestedGlobal))
    const now = new Date()
    const activePromotions = await Promotion.find(scoped(businessId, { active: true, $and: [{ $or: [{ startDate: null }, { startDate: { $lte: now } }] }, { $or: [{ endDate: null }, { endDate: { $gte: now } }] }] })).session(session)
    const applicablePromotions = activePromotions.filter((promotion) => items.some((item) => (!promotion.productIds.length || promotion.productIds.some((id) => String(id) === String(item.productId))) && (!promotion.categoryNames.length || promotion.categoryNames.includes(byId.get(String(item.productId)).category)) && (!promotion.variantIds.length || promotion.variantIds.some((id) => String(id) === String(item.variantId))) && item.quantity >= promotion.minimumQuantity))
    const promotionValues = applicablePromotions.map((promotion) => {
      const eligible = items.filter((item) => (!promotion.productIds.length || promotion.productIds.some((id) => String(id) === String(item.productId))) && (!promotion.categoryNames.length || promotion.categoryNames.includes(byId.get(String(item.productId)).category)) && (!promotion.variantIds.length || promotion.variantIds.some((id) => String(id) === String(item.variantId))) && item.quantity >= promotion.minimumQuantity)
      const eligibleValue = eligible.reduce((sum, item) => sum + item.taxableAmount, 0)
      let amount = promotion.type === 'fixed' ? promotion.discountValue : eligibleValue * promotion.discountValue / 100
      if (promotion.type === 'buy_x_get_y') amount = eligible.reduce((sum, item) => sum + Math.floor(item.quantity / (promotion.buyQuantity + promotion.getQuantity)) * promotion.getQuantity * item.sellingPrice, 0)
      return { promotion, amount: round2(Math.min(eligibleValue, amount)) }
    })
    const appliedPromotion = promotionValues.sort((a, b) => b.amount - a.amount)[0] || null
    if (appliedPromotion) discount = round2(Math.min(afterLines, discount + appliedPromotion.amount))
    let coupon = null
    let couponDiscount = 0
    if (payload.couponCode) {
      coupon = await Coupon.findOne(scoped(businessId, { code: String(payload.couponCode).trim().toUpperCase() })).session(session)
      assert(coupon?.active, 'Coupon is invalid or disabled.'); assert(!coupon.validFrom || coupon.validFrom <= now, 'Coupon is not valid yet.'); assert(!coupon.validUntil || coupon.validUntil >= now, 'Coupon has expired.'); assert(afterLines >= coupon.minimumOrderValue, `Coupon requires a minimum order of ${coupon.minimumOrderValue}.`); assert(!coupon.totalUsageLimit || coupon.usageCount < coupon.totalUsageLimit, 'Coupon usage limit reached.'); const customerUses = customer ? coupon.usages.filter((u) => String(u.customerId) === String(customer._id)).length : 0; assert(!coupon.perCustomerUsageLimit || customerUses < coupon.perCustomerUsageLimit, 'Customer coupon usage limit reached.'); const eligible = items.filter((item) => (!coupon.productIds.length || coupon.productIds.some((id) => String(id) === String(item.productId))) && (!coupon.categoryNames.length || coupon.categoryNames.includes(byId.get(String(item.productId)).category)) && (!coupon.variantIds.length || coupon.variantIds.some((id) => String(id) === String(item.variantId)))); assert(eligible.length, 'Coupon does not apply to these items.'); const eligibleValue = eligible.reduce((sum, item) => sum + item.taxableAmount, 0); couponDiscount = coupon.discountType === 'percentage' ? eligibleValue * coupon.discountValue / 100 : coupon.discountValue; if (coupon.maximumDiscount) couponDiscount = Math.min(couponDiscount, coupon.maximumDiscount); couponDiscount = round2(Math.min(eligibleValue, couponDiscount)); discount = round2(Math.min(afterLines, discount + couponDiscount))
    }
    const pointsRedeemed = toNumber(payload.loyaltyPointsRedeemed || 0, 'Loyalty points', { min: 0, integer: true })
    assert(!pointsRedeemed || customer, 'Select a customer to redeem loyalty points.')
    assert(!customer || pointsRedeemed <= customer.loyaltyPoints, 'Insufficient loyalty points.')
    const loyaltyDiscount = round2(pointsRedeemed * Number(business.settings?.loyaltyPointValue || 0))
    discount = round2(Math.min(afterLines, discount + loyaltyDiscount))

    const paymentPayload = Array.isArray(payload.payments) ? payload.payments : []
    for (const payment of paymentPayload) assert(PAYMENT_METHODS.includes(payment.method), `Unsupported payment method: ${payment.method}.`)
    const configuredOffers = business.settings?.paymentOffers || []
    const offer = configuredOffers.find((entry) => entry.active !== false && entry.code === payload.offerCode && paymentPayload.some((payment) => payment.method === entry.paymentMethod) && afterLines >= entry.minimumAmount)
    let offerDiscount = 0
    if (offer) {
      offerDiscount = offer.discountType === 'fixed' ? offer.value : afterLines * offer.value / 100
      if (offer.maximumDiscount > 0) offerDiscount = Math.min(offerDiscount, offer.maximumDiscount)
      offerDiscount = round2(Math.min(afterLines - discount, offerDiscount))
    }

    const taxableBase = round2(Math.max(0, afterLines - discount - offerDiscount))
    const baseBeforeSharedDiscount = items.reduce((sum, item) => sum + item.taxableAmount, 0) || 1
    let tax = 0
    for (const item of items) {
      const share = item.taxableAmount / baseBeforeSharedDiscount
      item.taxableAmount = round2(taxableBase * share)
      item.tax = round2(item.taxableAmount * item.gstRate / 100)
      item.total = round2(item.taxableAmount + item.tax)
      delete item.gross
      tax += item.tax
    }
    tax = round2(tax)
    const interstate = Boolean(customer?.state && business.state && customer.state.trim().toLowerCase() !== business.state.trim().toLowerCase())
    const igst = interstate ? tax : 0
    const cgst = interstate ? 0 : round2(tax / 2)
    const sgst = interstate ? 0 : round2(tax - cgst)
    const unrounded = round2(taxableBase + tax)
    const totalAmount = Math.round(unrounded)
    const roundOff = round2(totalAmount - unrounded)

    const payments = paymentPayload.map((payment) => ({ method: payment.method, amount: round2(Math.max(0, Number(payment.amount) || 0)), reference: String(payment.reference || '').trim() }))
    const amountPaid = round2(payments.filter((payment) => !['Credit', 'Pay Later'].includes(payment.method)).reduce((sum, payment) => sum + payment.amount, 0))
    assert(amountPaid <= totalAmount + 0.001, 'Payment amount cannot exceed the bill total.')
    const balanceDue = round2(totalAmount - amountPaid)
    assert(balanceDue <= 0 || customer, 'Select a customer before creating credit or a partial payment.')
    const paymentStatus = amountPaid >= totalAmount ? 'Paid' : amountPaid > 0 ? 'Partially Paid' : 'Unpaid'
    const number = invoiceNumber(business)
    const [order] = await SalesOrder.create([{
      business: business._id, orderNumber: number, invoiceNumber: number, channel: 'POS', billingType,
      customerId: customer?._id || null, customerName: customer?.name || 'Walk-in Customer', customerSnapshot: customer ? { name: customer.name, phone: customer.phone, email: customer.email, address: customer.address, city: customer.city, state: customer.state, gstin: customer.gstin, customerType: customer.customerType } : { name: 'Walk-in Customer' },
      items, subtotal, discount: round2(lineDiscount + discount), offerDiscount, promotionId: appliedPromotion?.promotion._id || null, promotionName: appliedPromotion?.promotion.name || '', couponCode: coupon?.code || '', tax, cgst, sgst, igst, roundOff, totalAmount,
      status: 'Completed', paymentStatus, notes: String(payload.notes || '').trim(), createdBy: actor.name, cashierId: actor.id,
      cashierName: actor.name, amountPaid, balanceDue, paymentSummary: payments,
    }], { session })

    for (const item of items) {
      if (!item.variantId) await applyStockChange({ businessId, productId: item.productId, type: 'stock_out', quantity: item.quantity, reason: 'POS Sale', referenceId: String(order._id), createdBy: actor.name }, session)
      else { const product = byId.get(String(item.productId)); const variant = product.variants.id(item.variantId); const previousStock = variant.currentStock; variant.currentStock -= item.quantity; product.currentStock = product.variants.reduce((n, v) => n + v.currentStock, 0); await product.save({ session }); await StockTransaction.create([{ business: business._id, productId: product._id, variantId: variant._id, variantSku: variant.sku, variantSize: variant.size, variantColor: variant.color, type: 'stock_out', quantity: item.quantity, previousStock, newStock: variant.currentStock, reason: 'POS Sale', referenceId: String(order._id), createdBy: actor.name }], { session }) }
    }
    const actualPayments = payments.filter((payment) => payment.amount > 0 && !['Credit', 'Pay Later'].includes(payment.method))
    if (actualPayments.length) await Payment.create(actualPayments.map((payment) => ({ business: business._id, type: 'sale', referenceId: order._id, referenceModel: 'SalesOrder', amount: payment.amount, paymentMethod: payment.method, paymentDate: new Date().toISOString().slice(0, 10), notes: `POS ${number}`, recordedBy: actor.name, transactionReference: payment.reference, offerCode: offer?.code || '' })), { session, ordered: true })
    if (customer) {
      const creditUsed = round2(payments.filter((p) => p.method === 'Store Credit').reduce((n, p) => n + p.amount, 0)); assert(creditUsed <= customer.creditBalance, 'Store credit exceeds the customer balance.'); if (creditUsed) { customer.creditBalance = round2(customer.creditBalance - creditUsed); await StoreCreditTransaction.create([{ business: business._id, customerId: customer._id, orderId: order._id, type: 'Redeem', amount: creditUsed, balanceAfter: customer.creditBalance, processedBy: actor.name }], { session }) }
      if (pointsRedeemed) { customer.loyaltyPoints -= pointsRedeemed; await LoyaltyTransaction.create([{ business: business._id, customerId: customer._id, orderId: order._id, type: 'Redeem', points: pointsRedeemed, balanceAfter: customer.loyaltyPoints, processedBy: actor.name }], { session }) }
      const spendPerPoint = Number(business.settings?.loyaltySpendPerPoint || 0); if (spendPerPoint > 0) { const earned = Math.floor(amountPaid / spendPerPoint); if (earned) { customer.loyaltyPoints += earned; await LoyaltyTransaction.create([{ business: business._id, customerId: customer._id, orderId: order._id, type: 'Earn', points: earned, balanceAfter: customer.loyaltyPoints, processedBy: actor.name }], { session }) } }
      customer.totalPurchases = round2((customer.totalPurchases || 0) + totalAmount)
      customer.outstandingBalance = round2((customer.outstandingBalance || 0) + balanceDue)
      await customer.save({ session })
    }
    for (const payment of payments.filter((p) => p.method === 'Gift Card' && p.amount > 0)) { const card = await GiftCard.findOne(scoped(businessId, { code: payment.reference.toUpperCase(), active: true })).session(session); assert(card && (!card.expiryDate || card.expiryDate >= new Date()), 'Gift card is invalid, expired or disabled.'); assert(!card.customerId || String(card.customerId) === String(customer?._id), 'This gift card belongs to another customer.'); assert(card.currentBalance >= payment.amount, 'Gift card balance is insufficient.'); card.currentBalance = round2(card.currentBalance - payment.amount); card.transactions.push({ type: 'Redeem', amount: payment.amount, balanceAfter: card.currentBalance, orderId: order._id, processedBy: actor.name, createdAt: new Date() }); await card.save({ session }) }
    if (coupon) { coupon.usageCount += 1; coupon.usages.push({ customerId: customer?._id || null, orderId: order._id, discount: couponDiscount, usedAt: new Date() }); await coupon.save({ session }) }
    if (appliedPromotion) { appliedPromotion.promotion.usageCount += 1; appliedPromotion.promotion.discountGranted = round2(appliedPromotion.promotion.discountGranted + appliedPromotion.amount); await appliedPromotion.promotion.save({ session }) }
    const invoice = order.toJSON()
    return { invoice: { ...invoice, business: business.toJSON() }, upiPaymentUri: business.settings?.upiId ? `upi://pay?pa=${encodeURIComponent(business.settings.upiId)}&pn=${encodeURIComponent(business.name)}&am=${balanceDue || totalAmount}&cu=INR&tn=${encodeURIComponent(number)}` : '' }
  })
}

export async function listInvoices(businessId, query = {}) {
  const filter = scoped(businessId, { channel: 'POS' })
  if (query.search) {
    const term = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filter.$or = [{ invoiceNumber: new RegExp(term, 'i') }, { customerName: new RegExp(term, 'i') }]
  }
  const docs = await SalesOrder.find(filter).sort('-createdAt').limit(Math.min(200, Number(query.limit) || 100))
  return docs.map((doc) => doc.toJSON())
}

export async function listCatalog(businessId, query = {}) {
  const filter = scoped(businessId)
  if (query.search) {
    const term = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const rx = new RegExp(term, 'i')
    filter.$or = [{ name: rx }, { sku: rx }, { barcode: rx }, { 'variants.sku': rx }, { 'variants.barcode': rx }, { 'variants.size': rx }, { 'variants.color': rx }]
  }
  const docs = await Product.find(filter).sort('name').limit(500)
  return docs.flatMap((doc) => {
    const product = doc.toJSON()
    if (!doc.variants.some((variant) => variant.active)) return [product]
    return doc.variants.filter((variant) => variant.active).map((variant) => ({ ...product, variantId: String(variant._id), sku: variant.sku, barcode: variant.barcode, size: variant.size, color: variant.color, currentStock: variant.currentStock, sellingPrice: variant.sellingPrice ?? product.sellingPrice, purchasePrice: variant.purchasePrice ?? product.purchasePrice }))
  })
}

export async function getInvoice(businessId, id) {
  const [order, business] = await Promise.all([SalesOrder.findOne(scoped(businessId, { _id: toObjectId(id, 'invoice id'), channel: 'POS' })), Business.findById(toObjectId(businessId, 'business'))])
  if (!order) throw ApiError.notFound('POS invoice not found.')
  return { ...order.toJSON(), business: business.toJSON() }
}
