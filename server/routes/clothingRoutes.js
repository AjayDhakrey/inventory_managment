import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ok, created } from '../utils/respond.js'
import { requireModule, requirePermission } from '../middleware/auth.js'
import { clothingService as service } from '../services/clothingService.js'

export const clothingRoutes = Router()
const actor = (req) => req.user.name || req.user.email
clothingRoutes.get('/variants', requireModule('variantGrid'), requirePermission('view_variants'), asyncHandler(async (req, res) => ok(res, await service.listVariants(req.businessId, req.query))))
clothingRoutes.put('/products/:productId/variants', requireModule('variantGrid'), requirePermission('manage_variants'), asyncHandler(async (req, res) => ok(res, await service.bulkUpsertVariants(req.businessId, req.params.productId, req.body.variants, actor(req)), 'Variants saved.')))
clothingRoutes.post('/products/:productId/variants/:variantId/stock', requireModule('variantGrid'), requirePermission('manage_variants'), asyncHandler(async (req, res) => created(res, await service.changeVariantStock(req.businessId, req.params.productId, req.params.variantId, req.body, actor(req)), 'Variant stock updated.')))
clothingRoutes.get('/barcode/:code', requireModule('variantGrid'), requirePermission('view_variants'), asyncHandler(async (req, res) => ok(res, await service.resolveBarcode(req.businessId, req.params.code))))
clothingRoutes.get('/replenishment', requireModule('replenishment'), requirePermission('view_replenishment'), asyncHandler(async (req, res) => ok(res, await service.replenishment(req.businessId, req.query))))
clothingRoutes.post('/replenishment/purchase-order', requireModule('replenishment'), requirePermission('manage_replenishment'), asyncHandler(async (req, res) => created(res, await service.createDraftPO(req.businessId, req.body, actor(req)), 'Draft purchase order created.')))
for (const [path, permission] of [['promotions', 'manage_promotions'], ['coupons', 'manage_coupons'], ['giftCards', 'manage_gift_cards']]) {
  clothingRoutes.get(`/${path}`, requireModule(path), requirePermission(permission), asyncHandler(async (req, res) => ok(res, await service.listRecords(path, req.businessId, req.query))))
  clothingRoutes.post(`/${path}`, requireModule(path), requirePermission(permission), asyncHandler(async (req, res) => created(res, await service.saveRecord(path, req.businessId, req.body), `${path} record created.`)))
  clothingRoutes.patch(`/${path}/:id`, requireModule(path), requirePermission(permission), asyncHandler(async (req, res) => ok(res, await service.updateRecord(path, req.businessId, req.params.id, req.body), `${path} record updated.`)))
}
clothingRoutes.get('/loyalty/:customerId', requireModule('loyalty'), requirePermission('manage_loyalty'), asyncHandler(async (req, res) => ok(res, await service.loyaltyHistory(req.businessId, req.params.customerId))))
clothingRoutes.post('/loyalty/:customerId', requireModule('loyalty'), requirePermission('manage_loyalty'), asyncHandler(async (req, res) => created(res, await service.adjustLoyalty(req.businessId, req.params.customerId, req.body, actor(req)), 'Loyalty balance updated.')))
clothingRoutes.get('/shifts', requireModule('cashierShifts'), requirePermission('manage_cashier_shift'), asyncHandler(async (req, res) => ok(res, await service.listShifts(req.businessId))))
clothingRoutes.post('/shifts', requireModule('cashierShifts'), requirePermission('manage_cashier_shift'), asyncHandler(async (req, res) => created(res, await service.startShift(req.businessId, req.user, req.body), 'Shift started.')))
clothingRoutes.patch('/shifts/:id/close', requireModule('cashierShifts'), requirePermission('manage_cashier_shift'), asyncHandler(async (req, res) => ok(res, await service.closeShift(req.businessId, req.params.id, req.body, actor(req)), 'Shift closed.')))
clothingRoutes.post('/shifts/cash-movement', requireModule('cashierShifts'), requirePermission('manage_cashier_shift'), asyncHandler(async (req, res) => created(res, await service.cashMovement(req.businessId, req.user._id, req.body), 'Cash movement recorded.')))
clothingRoutes.get('/reports', requireModule('clothingReports'), requirePermission('view_clothing_reports'), asyncHandler(async (req, res) => ok(res, await service.clothingReport(req.businessId))))
