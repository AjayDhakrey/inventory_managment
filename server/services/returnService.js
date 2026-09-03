import { Return } from '../models/Return.js'
import { SalesOrder } from '../models/SalesOrder.js'
import { PurchaseOrder } from '../models/PurchaseOrder.js'
import { Receiving } from '../models/Receiving.js'
import { withTransaction } from '../config/db.js'
import { applyStockChange } from './inventoryService.js'
import { toObjectId, toNumber, assert } from '../validators/assert.js'

function scoped(businessId, extra = {}) {
  return { business: toObjectId(businessId, 'business'), ...extra }
}

const MODEL_BY_TYPE = { sale: SalesOrder, purchase: PurchaseOrder }

export async function listReturns(businessId, query = {}) {
  const filter = scoped(businessId)
  if (query.type) filter.type = query.type
  const docs = await Return.find(filter).sort('-createdAt')
  return docs.map((doc) => doc.toJSON())
}

export async function createReturn(businessId, payload, processedBy) {
  const type = payload.type === 'purchase' ? 'purchase' : 'sale'
  return withTransaction(async (session) => {
    const OrderModel = MODEL_BY_TYPE[type]
    const order = await OrderModel.findOne(scoped(businessId, { _id: toObjectId(payload.orderId, 'order id') })).session(session)
    assert(order, 'Select a valid order.')

    const orderedItem = order.items.find((item) => String(item.productId) === String(payload.productId))
    assert(orderedItem, 'Select a product that belongs to the order.')
    assert(type !== 'sale' || order.status === 'Completed', 'Only completed sales can be returned.')
    assert(type !== 'purchase' || ['Partially Received', 'Received'].includes(order.status), 'Only received purchase stock can be returned.')

    const quantity = toNumber(payload.quantity, 'Quantity', { min: 1, integer: true })
    const previousReturns = await Return.find(scoped(businessId, { type, orderId: order._id, productId: orderedItem.productId, status: 'Completed' })).session(session)
    const alreadyReturned = previousReturns.reduce((sum, item) => sum + item.quantity, 0)
    let returnableQuantity = orderedItem.quantity
    if (type === 'purchase') {
      const receivings = await Receiving.find(scoped(businessId, { purchaseOrderId: order._id })).session(session)
      returnableQuantity = receivings.reduce((sum, receipt) => sum + receipt.items.filter((item) => String(item.productId) === String(orderedItem.productId)).reduce((lineSum, item) => lineSum + item.acceptedQuantity, 0), 0)
    }
    assert(quantity <= returnableQuantity - alreadyReturned, `Only ${Math.max(0, returnableQuantity - alreadyReturned)} unit(s) remain returnable.`)
    const refundAmount = toNumber(payload.refundAmount ?? 0, 'Refund amount', { min: 0 })
    assert(refundAmount <= Math.max(0, order.totalAmount - (order.refundedAmount || 0)), 'Refund amount exceeds the remaining refundable order value.')

    const [record] = await Return.create(
      [
        {
          business: scoped(businessId).business,
          type,
          orderId: order._id,
          orderModel: type === 'sale' ? 'SalesOrder' : 'PurchaseOrder',
          productId: orderedItem.productId,
          productName: orderedItem.productName,
          quantity,
          reason: payload.reason || 'Other',
          refundAmount,
          status: 'Completed',
          processedBy,
        },
      ],
      { session },
    )

    // Sales return: goods come back in (+). Purchase return: goods go back out (-).
    await applyStockChange(
      {
        businessId,
        productId: orderedItem.productId,
        type: type === 'sale' ? 'sales_return' : 'purchase_return',
        quantity,
        reason: type === 'sale' ? 'Sales Return' : 'Purchase Return',
        referenceId: String(record._id),
        createdBy: processedBy,
        allowNegative: false,
      },
      session,
    )

    order.refundedAmount = Math.min(order.totalAmount, (order.refundedAmount || 0) + record.refundAmount)
    await order.save({ session })

    return record.toJSON()
  })
}

export const returnService = { listReturns, createReturn }
