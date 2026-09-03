import { asyncHandler } from '../utils/asyncHandler.js'
import { ok } from '../utils/respond.js'
import * as service from '../services/notificationService.js'
export const list = asyncHandler(async (req, res) => ok(res, await service.listNotifications(req.businessId, req.auth.userId, req.query)))
export const read = asyncHandler(async (req, res) => ok(res, await service.markRead(req.businessId, req.auth.userId, req.params.id)))
export const readAll = asyncHandler(async (req, res) => ok(res, await service.markAllRead(req.businessId, req.auth.userId)))
export const dismiss = asyncHandler(async (req, res) => ok(res, await service.dismiss(req.businessId, req.auth.userId, req.params.id)))
