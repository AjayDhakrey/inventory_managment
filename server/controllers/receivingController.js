import { asyncHandler } from '../utils/asyncHandler.js'
import { ok, created } from '../utils/respond.js'
import { receivingService } from '../services/receivingService.js'
import { notificationEvents } from '../services/notificationEvents.js'

const actor = (req) => req.user.name || req.user.email

export const listController = asyncHandler(async (req, res) => {
  ok(res, await receivingService.listReceivings(req.businessId, req.query))
})
export const pendingController = asyncHandler(async (req, res) => {
  ok(res, await receivingService.pendingOrders(req.businessId))
})
export const createController = asyncHandler(async (req, res) => {
  const receipt = await receivingService.createReceiving(req.businessId, req.body, actor(req))
  await notificationEvents.received(req.businessId, receipt)
  created(res, receipt, 'Receiving recorded. Accepted stock was added to inventory.')
})
