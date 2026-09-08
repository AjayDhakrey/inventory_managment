import { asyncHandler } from '../utils/asyncHandler.js'
import { ok, created } from '../utils/respond.js'
import { attachSession } from '../utils/cookies.js'
import * as businessService from '../services/businessService.js'

export const createBusinessController = asyncHandler(async (req, res) => {
  const result = await businessService.createBusiness(req.user, req.body)
  // The JWT now carries the new businessId - refresh the browser cookie too.
  const { csrfToken } = attachSession(res, { token: result.token })
  created(res, { ...result, csrfToken }, 'Business workspace created.')
})

export const getMyBusinessController = asyncHandler(async (req, res) => {
  ok(res, await businessService.getBusiness(req.businessId))
})

export const updateMyBusinessController = asyncHandler(async (req, res) => {
  ok(res, await businessService.updateBusiness(req.businessId, req.body), 'Business profile saved.')
})

export const deleteMyBusinessController = asyncHandler(async (req, res) => {
  ok(res, await businessService.deleteBusiness(req.businessId, req.user), 'Business workspace deleted.')
})
