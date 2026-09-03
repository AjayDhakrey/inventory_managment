import { asyncHandler } from '../utils/asyncHandler.js'
import { ok, created } from '../utils/respond.js'
import { returnService } from '../services/returnService.js'
import { notificationEvents } from '../services/notificationEvents.js'

export const listController = asyncHandler(async (req, res) => {
  ok(res, await returnService.listReturns(req.businessId, req.query))
})
export const createController = asyncHandler(async (req, res) => {
  const record = await returnService.createReturn(req.businessId, req.body, req.user.name || req.user.email)
  await notificationEvents.returned(req.businessId, record)
  created(res, record, `${record.returnId} completed and inventory updated.`)
})
