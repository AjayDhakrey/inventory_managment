import { asyncHandler } from '../utils/asyncHandler.js'
import { created, ok } from '../utils/respond.js'
import * as productImportService from '../services/productImportService.js'

export const extract = asyncHandler(async (req, res) => ok(res, await productImportService.extract(req.businessId, req.file)))
export const confirm = asyncHandler(async (req, res) => created(res, await productImportService.confirm(req.businessId, req.body, { id: req.auth.userId, name: req.user.name || req.user.email }), 'Product import completed.'))
export const history = asyncHandler(async (req, res) => ok(res, await productImportService.history(req.businessId)))
