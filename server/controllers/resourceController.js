import { asyncHandler } from '../utils/asyncHandler.js'
import { ok, created } from '../utils/respond.js'

/** Builds standard CRUD HTTP handlers around a business-scoped service. */
export function resourceController(service, { messages = {} } = {}) {
  return {
    list: asyncHandler(async (req, res) => {
      ok(res, await service.list(req.businessId, req.query))
    }),
    get: asyncHandler(async (req, res) => {
      ok(res, await service.get(req.businessId, req.params.id))
    }),
    create: asyncHandler(async (req, res) => {
      created(res, await service.create(req.businessId, req.body), messages.created)
    }),
    update: asyncHandler(async (req, res) => {
      ok(res, await service.update(req.businessId, req.params.id, req.body), messages.updated)
    }),
    remove: asyncHandler(async (req, res) => {
      ok(res, await service.remove(req.businessId, req.params.id), messages.removed)
    }),
  }
}
