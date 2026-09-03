import { asyncHandler } from '../utils/asyncHandler.js'
import { ok, created } from '../utils/respond.js'
import { purchaseOrderService } from '../services/purchaseOrderService.js'
import { notificationEvents } from '../services/notificationEvents.js'

const actor = (req) => req.user.name || req.user.email

export const listController = asyncHandler(async (req, res) => {
  ok(res, await purchaseOrderService.listOrders(req.businessId, req.query))
})
export const getController = asyncHandler(async (req, res) => {
  ok(res, await purchaseOrderService.getOrder(req.businessId, req.params.id))
})
export const createController = asyncHandler(async (req, res) => {
  const order = await purchaseOrderService.createOrder(req.businessId, req.body, actor(req))
  await notificationEvents.purchaseCreated(req.businessId, order)
  created(res, order, 'Purchase order saved successfully.')
})
export const updateController = asyncHandler(async (req, res) => {
  ok(res, await purchaseOrderService.updateOrder(req.businessId, req.params.id, req.body), 'Purchase order updated.')
})
export const statusController = asyncHandler(async (req, res) => {
  const order = await purchaseOrderService.setStatus(req.businessId, req.params.id, req.body.status)
  await notificationEvents.purchaseStatus(req.businessId, order)
  ok(res, order, 'Purchase order updated.')
})
