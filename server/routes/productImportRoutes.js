import { Router } from 'express'
import multer from 'multer'
import { requirePermission } from '../middleware/auth.js'
import * as controller from '../controllers/productImportController.js'
import { ApiError } from '../utils/ApiError.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 }, fileFilter(_req, file, callback) { const allowed = ['application/pdf', 'text/csv', 'application/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']; callback(allowed.includes(file.mimetype) || /\.(pdf|csv|xlsx)$/i.test(file.originalname) ? null : new ApiError(415, 'Only PDF, CSV and XLSX files are supported.'), true) } })

export const productImportRoutes = Router()
const permissions = [requirePermission('create_product'), requirePermission('stock_in')]
productImportRoutes.get('/history', ...permissions, controller.history)
productImportRoutes.post('/extract', ...permissions, upload.single('file'), controller.extract)
productImportRoutes.post('/confirm', ...permissions, controller.confirm)
