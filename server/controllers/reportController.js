import { asyncHandler } from '../utils/asyncHandler.js'
import { ok } from '../utils/respond.js'
import { getReport } from '../services/reportService.js'

export const reportController = asyncHandler(async (req, res) => {
  ok(res, await getReport(req.businessId))
})
