import { asyncHandler } from '../utils/asyncHandler.js'
import { ok, created } from '../utils/respond.js'
import { returnService } from '../services/returnService.js'
import { notificationEvents } from '../services/notificationEvents.js'

export const listController = asyncHandler(async (req, res) => {
  ok(res, await returnService.listReturns(req.businessId, req.query))
})
export const getController = asyncHandler(async (req, res) => {
  ok(res, await returnService.getReturn(req.businessId, req.params.id))
})
export const ordersController = asyncHandler(async (req, res) => {
  ok(res, await returnService.listEligibleOrders(req.businessId, req.query))
})
export const createController = asyncHandler(async (req, res) => {
  const record = await returnService.createReturn(req.businessId, req.body, req.user.name || req.user.email)
  await notificationEvents.returned(req.businessId, record)
  created(res, record, `${record.returnId} completed and inventory updated.`)
})
export const refundController = asyncHandler(async (req, res) => {
  const result = await returnService.createRefund(req.businessId, req.params.id, req.body, req.user.name || req.user.email, req.permissions)
  await notificationEvents.refund(req.businessId, result)
  created(res, result, 'Refund transaction recorded internally. No external payment gateway was contacted.')
})
export const updateRefundController = asyncHandler(async (req, res) => {
  const result = await returnService.updateRefund(req.businessId, req.params.id, req.params.refundId, req.body, req.user.name || req.user.email)
  await notificationEvents.refund(req.businessId, result)
  ok(res, result, 'Refund status updated.')
})
export const cancelController = asyncHandler(async (req, res) => {
  ok(res, await returnService.cancelReturn(req.businessId, req.params.id, req.user.name || req.user.email), 'Return cancelled.')
})
