import { asyncHandler } from '../utils/asyncHandler.js'
import { ok, created } from '../utils/respond.js'
import { salesOrderService } from '../services/salesOrderService.js'
import { notificationEvents } from '../services/notificationEvents.js'

const actor = (req) => req.user.name || req.user.email

export const listController = asyncHandler(async (req, res) => {
  ok(res, await salesOrderService.listOrders(req.businessId, req.query))
})
export const getController = asyncHandler(async (req, res) => {
  ok(res, await salesOrderService.getOrder(req.businessId, req.params.id))
})
export const createController = asyncHandler(async (req, res) => {
  const order = await salesOrderService.createOrder(req.businessId, req.body, actor(req))
  await notificationEvents.salesCreated(req.businessId, order)
  created(res, order, 'Sales order saved successfully.')
})
export const updateController = asyncHandler(async (req, res) => {
  ok(res, await salesOrderService.updateOrder(req.businessId, req.params.id, req.body), 'Sales order updated.')
})
export const completeController = asyncHandler(async (req, res) => {
  const order = await salesOrderService.completeOrder(req.businessId, req.params.id, actor(req))
  await notificationEvents.salesStatus(req.businessId, order)
  ok(res, order, 'Order completed. Inventory was reduced.')
})
export const cancelController = asyncHandler(async (req, res) => {
  const order = await salesOrderService.cancelOrder(req.businessId, req.params.id)
  await notificationEvents.salesStatus(req.businessId, order)
  ok(res, order, 'Order cancelled.')
})
