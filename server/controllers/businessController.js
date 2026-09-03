import { asyncHandler } from '../utils/asyncHandler.js'
import { ok, created } from '../utils/respond.js'
import * as businessService from '../services/businessService.js'

export const createBusinessController = asyncHandler(async (req, res) => {
  const result = await businessService.createBusiness(req.user, req.body)
  created(res, result, 'Business workspace created.')
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
