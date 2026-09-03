import { Product } from '../models/Product.js'
import { SalesOrder } from '../models/SalesOrder.js'
import { PurchaseOrder } from '../models/PurchaseOrder.js'
import { StockTransaction } from '../models/StockTransaction.js'
import { toObjectId } from '../validators/assert.js'

export async function getReport(businessId) {
  const business = toObjectId(businessId, 'business')
  const [products, sales, purchases, transactionCount] = await Promise.all([
    Product.find({ business }).sort('name'),
    SalesOrder.find({ business, status: 'Completed' }),
    PurchaseOrder.find({ business }),
    StockTransaction.countDocuments({ business }),
  ])

  const salesTotal = sales.reduce((sum, order) => sum + order.totalAmount, 0)
  const purchaseTotal = purchases.reduce((sum, order) => sum + order.totalAmount, 0)
  const posSales = sales.filter((order) => order.channel === 'POS')

  return {
    salesTotal,
    purchaseTotal,
    posSalesTotal: posSales.reduce((sum, order) => sum + order.totalAmount, 0),
    posPaymentsReceived: posSales.reduce((sum, order) => sum + (order.amountPaid || 0), 0),
    posOutstanding: posSales.reduce((sum, order) => sum + (order.balanceDue || 0), 0),
    posInvoices: posSales.length,
    productCount: products.length,
    lowStock: products.filter((p) => p.currentStock > 0 && p.currentStock <= (p.minimumStock || 10)).length,
    outOfStock: products.filter((p) => p.currentStock === 0).length,
    stockMovements: transactionCount,
    products: products.map((p) => p.toJSON()),
  }
}
