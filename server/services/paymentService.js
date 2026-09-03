import { Payment } from '../models/Payment.js'
import { SalesOrder } from '../models/SalesOrder.js'
import { PurchaseOrder } from '../models/PurchaseOrder.js'
import { Customer } from '../models/Customer.js'
import { withTransaction } from '../config/db.js'
import { toObjectId, toNumber, assert } from '../validators/assert.js'

function scoped(businessId, extra = {}) {
  return { business: toObjectId(businessId, 'business'), ...extra }
}

const MODEL_BY_TYPE = { sale: SalesOrder, purchase: PurchaseOrder }
const REF_MODEL_BY_TYPE = { sale: 'SalesOrder', purchase: 'PurchaseOrder' }

export async function listPayments(businessId, query = {}) {
  const filter = scoped(businessId)
  if (query.type) filter.type = query.type
  const docs = await Payment.find(filter).sort('-createdAt')
  return docs.map((doc) => doc.toJSON())
}

async function paidSoFar(businessId, referenceId, session = null) {
  const aggregate = Payment.aggregate([
    { $match: { business: scoped(businessId).business, referenceId: toObjectId(referenceId, 'order id') } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ])
  if (session) aggregate.session(session)
  const rows = await aggregate
  return rows[0]?.total || 0
}

export async function createPayment(businessId, payload, recordedBy) {
  return withTransaction(async (session) => {
    const type = payload.type === 'purchase' ? 'purchase' : 'sale'
    const OrderModel = MODEL_BY_TYPE[type]
    const order = await OrderModel.findOne(scoped(businessId, { _id: toObjectId(payload.referenceId, 'order id') })).session(session)
    assert(order, 'Select a valid order for this payment.')

    const amount = toNumber(payload.amount, 'Amount', { min: 0.01 })
    const alreadyPaid = await paidSoFar(businessId, order._id, session)
    assert(alreadyPaid + amount <= order.totalAmount + 1e-6, 'This payment exceeds the outstanding balance.')

    const [payment] = await Payment.create([{
      business: scoped(businessId).business, type, referenceId: order._id, referenceModel: REF_MODEL_BY_TYPE[type], amount,
      paymentMethod: payload.paymentMethod || 'Cash', paymentDate: payload.paymentDate || new Date().toISOString().slice(0, 10),
      notes: (payload.notes || '').trim(), recordedBy, transactionReference: (payload.transactionReference || payload.reference || '').trim(), offerCode: (payload.offerCode || '').trim(),
    }], { session })

  const totalPaid = alreadyPaid + amount
  order.paymentStatus = totalPaid >= order.totalAmount - 1e-6 ? 'Paid' : 'Partially Paid'
  if (type === 'sale' && order.channel === 'POS') {
    const previousBalance = order.balanceDue || Math.max(0, order.totalAmount - alreadyPaid)
    order.amountPaid = Math.min(order.totalAmount, totalPaid)
    order.balanceDue = Math.max(0, order.totalAmount - totalPaid)
    order.paymentSummary.push({ method: payment.paymentMethod, amount: payment.amount, reference: payment.transactionReference || '' })
      if (order.customerId) await Customer.updateOne(scoped(businessId, { _id: order.customerId }), { $inc: { outstandingBalance: -(previousBalance - order.balanceDue) } }, { session })
    }
    await order.save({ session })
    return payment.toJSON()
  })
}

export const paymentService = { listPayments, createPayment }
