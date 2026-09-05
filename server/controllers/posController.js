import { asyncHandler } from '../utils/asyncHandler.js'
import { created, ok } from '../utils/respond.js'
import * as posService from '../services/posService.js'
import { notificationEvents } from '../services/notificationEvents.js'

export const checkout = asyncHandler(async (req, res) => {
  const result = await posService.checkout(req.businessId, req.body, { id: req.auth.userId, name: req.user.name || req.user.email }, req.permissions)
  // Checkout has committed. A notification failure must not hide the saved bill.
  try {
    await notificationEvents.salesStatus(req.businessId, result.invoice)
  } catch (error) {
    console.warn('Could not send the notification for POS invoice', result.invoice.invoiceNumber, error.message)
  }
  created(res, result, 'Sale completed and invoice generated.')
})
export const list = asyncHandler(async (req, res) => ok(res, await posService.listInvoices(req.businessId, req.query)))
export const get = asyncHandler(async (req, res) => ok(res, await posService.getInvoice(req.businessId, req.params.id)))
export const catalog = asyncHandler(async (req, res) => ok(res, await posService.listCatalog(req.businessId, req.query)))
export const customers = asyncHandler(async (req, res) => ok(res, await posService.listCustomers(req.businessId, req.query)))
