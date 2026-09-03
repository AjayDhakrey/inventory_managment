import { asyncHandler } from '../utils/asyncHandler.js'
import { ok, created } from '../utils/respond.js'
import * as inventoryService from '../services/inventoryService.js'
import { notificationEvents } from '../services/notificationEvents.js'

export const listTransactionsController = asyncHandler(async (req, res) => {
  ok(res, await inventoryService.listTransactions(req.businessId, req.query))
})

export const recordOperationController = asyncHandler(async (req, res) => {
  const result = await inventoryService.recordOperation(req.businessId, {
    section: req.body.section,
    productId: req.body.productId,
    quantity: req.body.quantity,
    reason: req.body.reason,
    createdBy: req.user.name || req.user.email,
  })
  await notificationEvents.inventory(req.businessId, result)
  created(res, result, `${req.body.section} recorded.`)
})
