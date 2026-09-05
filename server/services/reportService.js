import { Product } from '../models/Product.js'
import { SalesOrder } from '../models/SalesOrder.js'
import { PurchaseOrder } from '../models/PurchaseOrder.js'
import { StockTransaction } from '../models/StockTransaction.js'
import { Return } from '../models/Return.js'
import { Refund } from '../models/Refund.js'
import { Supplier } from '../models/Supplier.js'
import { Customer } from '../models/Customer.js'
import { toObjectId } from '../validators/assert.js'

export async function getReport(businessId) {
  const business = toObjectId(businessId, 'business')
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [products, allSales, purchases, transactions, returns, refunds, suppliers, customers] = await Promise.all([
    Product.find({ business }).sort('name'),
    SalesOrder.find({ business }).sort('-createdAt'),
    PurchaseOrder.find({ business }).sort('-createdAt'),
    StockTransaction.find({ business }),
    Return.find({ business, type: 'sale', status: 'Completed' }),
    Refund.find({ business, status: 'Refunded' }),
    Supplier.find({ business }),
    Customer.find({ business }),
  ])

  const completedSales = allSales.filter((order) => order.status === 'Completed')
  const pendingOrdersList = allSales.filter((order) => order.status === 'Pending')
  const grossSalesTotal = completedSales.reduce((sum, order) => sum + (order.totalAmount || 0), 0)
  const salesReturnTotal = returns.reduce((sum, record) => sum + (record.returnValue || record.refundAmount || 0), 0)
  const refundTotal = refunds.reduce((sum, refund) => sum + (refund.amount || 0), 0)
  const salesTotal = Math.max(0, grossSalesTotal - salesReturnTotal)
  const purchaseTotal = purchases.reduce((sum, order) => sum + (order.totalAmount || 0), 0)

  // Map product cost prices for accurate COGS & Profit calculations
  const productCostMap = new Map()
  products.forEach((product) => {
    productCostMap.set(String(product._id), Number(product.purchasePrice || 0))
  })

  // Calculate COGS and Gross Profit
  let totalCogs = 0
  completedSales.forEach((order) => {
    (order.items || []).forEach((item) => {
      const unitCost = productCostMap.get(String(item.productId)) || 0
      totalCogs += (Number(item.quantity) || 0) * unitCost
    })
  })
  const grossProfit = Math.max(0, salesTotal - totalCogs)

  // Today's metrics
  const todaySalesOrders = completedSales.filter((order) => new Date(order.createdAt) >= todayStart)
  const todaySales = todaySalesOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0)
  let todayCogs = 0
  todaySalesOrders.forEach((order) => {
    (order.items || []).forEach((item) => {
      const unitCost = productCostMap.get(String(item.productId)) || 0
      todayCogs += (Number(item.quantity) || 0) * unitCost
    })
  })
  const todayGrossProfit = Math.max(0, todaySales - todayCogs)

  // Receivables & Payables
  const salesReceivables = allSales.reduce((sum, order) => sum + Math.max(0, Number(order.balanceDue || 0)), 0)
  const customerDirectBalance = customers.reduce((sum, cust) => sum + Math.max(0, Number(cust.outstandingBalance || 0)), 0)
  const outstandingReceivables = Math.max(salesReceivables, customerDirectBalance)

  const purchaseDue = purchases
    .filter((order) => order.status !== 'Cancelled' && order.paymentStatus !== 'Paid')
    .reduce((sum, order) => sum + Math.max(0, Number(order.totalAmount || 0) - (order.paymentStatus === 'Partially Paid' ? Number(order.totalAmount || 0) * 0.5 : 0)), 0)

  const inventoryValue = products.reduce((sum, product) => sum + (Number(product.currentStock || 0) * Number(product.purchasePrice || 0)), 0)
  const totalUnitsInStock = products.reduce((sum, product) => sum + Number(product.currentStock || 0), 0)
  const lowStockProducts = products.filter((p) => Number(p.currentStock || 0) > 0 && Number(p.currentStock || 0) <= Number(p.reorderLevel || p.minimumStock || 10))
  const outOfStockProducts = products.filter((p) => Number(p.currentStock || 0) === 0)
  const reorderRequiredCount = products.filter((p) => Number(p.currentStock || 0) <= Number(p.reorderLevel || p.minimumStock || 10)).length

  const posSales = completedSales.filter((order) => order.channel === 'POS')
  const wholesaleOrders = allSales.filter((order) => order.billingType === 'wholesale' || order.channel === 'Order')
  const wholesaleRevenue = wholesaleOrders.filter((o) => o.status === 'Completed').reduce((sum, o) => sum + (o.totalAmount || 0), 0)

  const stockInCount = transactions.filter((t) => t.type === 'stock_in').length
  const stockOutCount = transactions.filter((t) => t.type === 'stock_out').length

  return {
    salesTotal,
    grossSalesTotal,
    salesReturnTotal,
    refundTotal,
    purchaseTotal,
    grossProfit,
    todaySales,
    todayGrossProfit,
    todayOrdersCount: todaySalesOrders.length,
    pendingOrdersCount: pendingOrdersList.length,
    pendingOrdersAmount: pendingOrdersList.reduce((sum, o) => sum + (o.totalAmount || 0), 0),
    outstandingReceivables,
    purchaseDue,
    inventoryValue,
    totalUnitsInStock,
    productCount: products.length,
    lowStock: lowStockProducts.length,
    outOfStock: outOfStockProducts.length,
    reorderRequired: reorderRequiredCount,
    activeSuppliers: suppliers.filter((s) => s.status !== 'archived').length,
    activeCustomers: customers.filter((c) => c.status !== 'archived').length,
    wholesaleOrdersCount: wholesaleOrders.length,
    wholesaleRevenue,
    posSalesTotal: posSales.reduce((sum, order) => sum + (order.totalAmount || 0), 0),
    posPaymentsReceived: posSales.reduce((sum, order) => sum + (order.amountPaid || 0), 0),
    posOutstanding: posSales.reduce((sum, order) => sum + (order.balanceDue || 0), 0),
    posInvoices: posSales.length,
    stockMovements: transactions.length,
    stockInCount,
    stockOutCount,
    products: products.map((p) => p.toJSON()),
  }
}
