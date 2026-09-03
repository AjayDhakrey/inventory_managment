import { asyncHandler } from '../utils/asyncHandler.js'
import { ok, created } from '../utils/respond.js'
import { paymentService } from '../services/paymentService.js'
import { notificationEvents } from '../services/notificationEvents.js'

export const listController = asyncHandler(async (req, res) => {
  ok(res, await paymentService.listPayments(req.businessId, req.query))
})
export const createController = asyncHandler(async (req, res) => {
  const payment = await paymentService.createPayment(req.businessId, req.body, req.user.name || req.user.email)
  await notificationEvents.payment(req.businessId, payment)
  created(res, payment, 'Payment recorded.')
})
