import { Receiving } from '../models/Receiving.js'
import { PurchaseOrder } from '../models/PurchaseOrder.js'
import { withTransaction } from '../config/db.js'
import { applyStockChange } from './inventoryService.js'
import { toObjectId, toNumber, assert } from '../validators/assert.js'

function scoped(businessId, extra = {}) {
  return { business: toObjectId(businessId, 'business'), ...extra }
}

function receivedForItem(receivings, productId) {
  return receivings.reduce(
    (sum, receiving) => sum + (receiving.items.find((item) => String(item.productId) === String(productId))?.receivedQuantity || 0),
    0,
  )
}

export async function listReceivings(businessId, query = {}) {
  const docs = await Receiving.find(scoped(businessId)).sort('-createdAt')
  let items = docs.map((doc) => doc.toJSON())
  if (query.search) {
    const term = String(query.search).toLowerCase()
    items = items.filter((item) => `${item.receivingId} ${item.purchaseOrderId} ${item.supplierId}`.toLowerCase().includes(term))
  }
  return items
}

/** Pending purchase orders plus each line's already-received quantity. */
export async function pendingOrders(businessId) {
  const orders = await PurchaseOrder.find(scoped(businessId, { status: { $nin: ['Received', 'Cancelled'] } })).sort('-createdAt')
  const receivings = await Receiving.find(scoped(businessId))
  return orders.map((order) => {
    const forOrder = receivings.filter((receiving) => String(receiving.purchaseOrderId) === String(order._id))
    return {
      ...order.toJSON(),
      lines: order.items.map((item) => ({
        productId: String(item.productId),
        productName: item.productName,
        orderedQuantity: item.quantity,
        alreadyReceived: receivedForItem(forOrder, item.productId),
      })),
    }
  })
}

export async function createReceiving(businessId, payload, receivedBy) {
  return withTransaction(async (session) => {
    const order = await PurchaseOrder.findOne(scoped(businessId, { _id: toObjectId(payload.purchaseOrderId, 'purchase order id') })).session(session)
    assert(order, 'Select a valid purchase order.')
    assert(!['Received', 'Cancelled'].includes(order.status), 'This purchase order is already closed.')

    const priorReceivings = await Receiving.find(scoped(businessId, { purchaseOrderId: order._id })).session(session)
    const requestedProductIds = (payload.items || []).map((line) => String(line.productId))
    assert(new Set(requestedProductIds).size === requestedProductIds.length, 'Each product can appear only once per receiving.')

    const items = (payload.items || []).map((line) => {
      const orderedItem = order.items.find((item) => String(item.productId) === String(line.productId))
      assert(orderedItem, 'Only ordered products can be received.')
      const alreadyReceived = receivedForItem(priorReceivings, line.productId)
      const remaining = orderedItem.quantity - alreadyReceived
      const receivedQuantity = toNumber(line.receivedQuantity ?? 0, 'Received quantity', { min: 0, integer: true })
      const damagedQuantity = toNumber(line.damagedQuantity ?? 0, 'Damaged quantity', { min: 0, integer: true })
      const rejectedQuantity = toNumber(line.rejectedQuantity ?? 0, 'Rejected quantity', { min: 0, integer: true })
      assert(receivedQuantity <= remaining, `Received quantity for ${orderedItem.productName} exceeds the remaining ordered quantity.`)
      assert(damagedQuantity + rejectedQuantity <= receivedQuantity, 'Damaged + rejected cannot exceed received quantity.')
      return {
        productId: orderedItem.productId,
        orderedQuantity: orderedItem.quantity,
        receivedQuantity,
        damagedQuantity,
        rejectedQuantity,
        acceptedQuantity: receivedQuantity - damagedQuantity - rejectedQuantity,
        batchNumber: (line.batchNumber || '').trim(),
        expiryDate: line.expiryDate || '',
      }
    })
    assert(items.length > 0, 'Add at least one line to receive.')
    assert(items.some((item) => item.receivedQuantity > 0), 'Enter a received quantity greater than zero.')

    const [receiving] = await Receiving.create(
      [
        {
          business: order.business,
          purchaseOrderId: order._id,
          supplierId: order.supplierId,
          items,
          receivedBy,
          notes: (payload.notes || '').trim(),
        },
      ],
      { session },
    )

    for (const item of items) {
      if (item.acceptedQuantity > 0) {
        await applyStockChange(
          {
            businessId,
            productId: item.productId,
            type: 'stock_in',
            quantity: item.acceptedQuantity,
            reason: 'Purchase Receiving',
            referenceId: String(receiving._id),
            receivedBy,
            createdBy: receivedBy,
          },
          session,
        )
      }
    }

    const allReceivings = [...priorReceivings, receiving]
    const fullyReceived = order.items.every((item) => receivedForItem(allReceivings, item.productId) >= item.quantity)
    order.status = fullyReceived ? 'Received' : 'Partially Received'
    await order.save({ session })

    return receiving.toJSON()
  })
}

export const receivingService = { listReceivings, pendingOrders, createReceiving }
