import { Router } from 'express'
import mongoose from 'mongoose'
import { authenticate, requireBusiness, requirePermission } from '../middleware/auth.js'
import { requireDatabase } from '../middleware/database.js'
import { authRoutes } from './authRoutes.js'
import { businessRoutes } from './businessRoutes.js'
import { productRoutes } from './productRoutes.js'
import { supplierRoutes } from './supplierRoutes.js'
import { customerRoutes } from './customerRoutes.js'
import { purchaseOrderRoutes } from './purchaseOrderRoutes.js'
import { salesOrderRoutes } from './salesOrderRoutes.js'
import { receivingRoutes } from './receivingRoutes.js'
import { paymentRoutes } from './paymentRoutes.js'
import { inventoryRoutes } from './inventoryRoutes.js'
import { returnRoutes } from './returnRoutes.js'
import { userRoutes } from './userRoutes.js'
import { reportController } from '../controllers/reportController.js'
import { notificationRoutes } from './notificationRoutes.js'
import { posRoutes } from './posRoutes.js'
import { productImportRoutes } from './productImportRoutes.js'

export const api = Router()

const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting']

// Health check never depends on the database being up.
api.get('/health', (_req, res) => {
  const db = DB_STATES[mongoose.connection.readyState] || 'unknown'
  res.json({ success: true, data: { status: 'ok', service: 'stockroom-api', db } })
})

// Auth + business routes still need the database.
api.use('/auth', requireDatabase, authRoutes)
api.use('/businesses', requireDatabase, businessRoutes)

// Business-scoped resources: DB up + authenticated user + completed business workspace.
const guard = [requireDatabase, authenticate, requireBusiness]
api.use('/products', guard, productRoutes)
api.use('/suppliers', guard, supplierRoutes)
api.use('/customers', guard, customerRoutes)
api.use('/purchase-orders', guard, purchaseOrderRoutes)
api.use('/sales-orders', guard, salesOrderRoutes)
api.use('/receiving', guard, receivingRoutes)
api.use('/payments', guard, paymentRoutes)
api.use('/inventory', guard, inventoryRoutes)
api.use('/returns', guard, returnRoutes)
api.use('/users', guard, userRoutes)
api.get('/reports/summary', guard, requirePermission('view_reports'), reportController)
api.use('/notifications', guard, notificationRoutes)
api.use('/pos', guard, posRoutes)
api.use('/product-imports', guard, productImportRoutes)
