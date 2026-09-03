import { connectDatabase, disconnectDatabase } from '../config/db.js'
import { User } from '../models/User.js'
import { Product } from '../models/Product.js'
import { Supplier } from '../models/Supplier.js'
import { Customer } from '../models/Customer.js'
import { PurchaseOrder } from '../models/PurchaseOrder.js'
import { SalesOrder } from '../models/SalesOrder.js'
import { productService } from '../services/productService.js'
import { supplierService } from '../services/supplierService.js'
import { customerService } from '../services/customerService.js'
import { purchaseOrderService } from '../services/purchaseOrderService.js'
import { receivingService } from '../services/receivingService.js'
import { salesOrderService } from '../services/salesOrderService.js'
import { paymentService } from '../services/paymentService.js'
import { returnService } from '../services/returnService.js'
import { recordOperation } from '../services/inventoryService.js'
import { notificationEvents } from '../services/notificationEvents.js'

const EMAIL = (process.argv[2] || 'ajaydhakrey@gmail.com').toLowerCase()
const tag = Date.now().toString().slice(-5)
const pick = (items) => items[Math.floor(Math.random() * items.length)]
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const future = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)

const productDefs = [
  ['Men Cotton Oxford Shirt', 'Shirts', 'Urban Loom', 430, 699, 48, 15],
  ['Men Slim Fit Chino Trousers', 'Trousers', 'ThreadCraft', 620, 999, 32, 12],
  ['Women Rayon Printed Kurti', 'Kurtis', 'Aarohi', 390, 649, 8, 12],
  ['Women Straight Fit Palazzo', 'Bottomwear', 'Aarohi', 310, 525, 27, 10],
  ['Unisex Oversized Cotton T-Shirt', 'T-Shirts', 'North Street', 280, 499, 65, 20],
  ['Kids Cotton Co-ord Set', 'Kids Wear', 'Tiny Tribe', 350, 599, 24, 8],
  ['Men Denim Jacket', 'Jackets', 'Blue Foundry', 980, 1549, 11, 6],
  ['Women Embroidered Dupatta', 'Ethnic Wear', 'Zariya', 260, 449, 0, 10],
  ['Fleece Hooded Sweatshirt', 'Winter Wear', 'North Street', 540, 899, 19, 8],
  ['Cotton Leggings Pack of 2', 'Bottomwear', 'Everyday Basics', 300, 525, 36, 12],
  ['School Uniform White Shirt', 'Uniforms', 'Campus Cloth', 240, 399, 54, 18],
  ['Premium Linen Shirt', 'Shirts', 'Urban Loom', 690, 1099, 14, 8],
]

const supplierDefs = [
  ['Surat Textile Hub', 'Manish Patel', 'Surat', 'Net 30'],
  ['Tiruppur Knitwear Collective', 'Kavya Raman', 'Tiruppur', 'Net 15'],
  ['Jaipur Ethnic Creations', 'Ritu Sharma', 'Jaipur', 'Net 30'],
  ['Delhi Garment Distributors', 'Aman Khurana', 'New Delhi', 'Net 7'],
]

const customerDefs = [
  ['Fashion Point Retail', 'Lucknow'], ['Shree Garments', 'Kanpur'], ['City Style Mart', 'Delhi'],
  ['New Look Apparels', 'Noida'], ['Kapoor Family Store', 'Gurugram'], ['Trend Basket', 'Jaipur'],
  ['Royal Cloth House', 'Agra'], ['Metro Fashion Outlet', 'Ghaziabad'],
]

async function run() {
  await connectDatabase()
  const user = await User.findOne({ email: EMAIL })
  if (!user?.business) throw new Error(`No completed business workspace found for ${EMAIL}.`)
  const businessId = String(user.business)

  const products = []
  for (let i = 0; i < productDefs.length; i += 1) {
    const [name, category, brand, purchasePrice, sellingPrice, currentStock, minimumStock] = productDefs[i]
    products.push(await productService.create(businessId, { name, sku: `WCL-${tag}-${String(i + 1).padStart(2, '0')}`, category, brand, purchasePrice, sellingPrice, currentStock, minimumStock, unit: 'piece', description: `${brand} wholesale clothing stock; assorted sizes and colours.` }))
  }

  const suppliers = []
  for (let i = 0; i < supplierDefs.length; i += 1) {
    const [supplierName, contactPerson, city, paymentTerms] = supplierDefs[i]
    suppliers.push(await supplierService.create(businessId, { supplierName: `${supplierName} ${tag}`, contactPerson, phone: `+91 98${rand(10000000, 99999999)}`, email: `orders${tag}${i}@wholesale.example`, city, state: city === 'Surat' ? 'Gujarat' : city === 'Tiruppur' ? 'Tamil Nadu' : city === 'Jaipur' ? 'Rajasthan' : 'Delhi', paymentTerms }))
  }

  const customers = []
  for (let i = 0; i < customerDefs.length; i += 1) {
    const [name, city] = customerDefs[i]
    customers.push(await customerService.create(businessId, { name: `${name} ${tag}`, phone: `+91 97${rand(10000000, 99999999)}`, email: `buyer${tag}${i}@retail.example`, city, notes: 'Wholesale clothing buyer · GST invoice required' }))
  }

  const purchaseOrders = []
  for (let i = 0; i < 5; i += 1) {
    const chosen = products.slice(i * 2, i * 2 + 3)
    const order = await purchaseOrderService.createOrder(businessId, { supplierId: suppliers[i % suppliers.length].supplierId, items: chosen.map((p) => ({ productId: p.productId, quantity: rand(20, 60), purchasePrice: p.purchasePrice, discount: rand(0, 120), tax: rand(40, 180) })), shippingCharges: rand(150, 500), expectedDeliveryDate: i === 3 ? future(-5) : future(rand(3, 18)), notes: 'Wholesale seasonal replenishment' }, EMAIL)
    await notificationEvents.purchaseCreated(businessId, order)
    const status = i < 3 ? 'Ordered' : i === 3 ? 'Approved' : 'Pending'
    const updated = await purchaseOrderService.setStatus(businessId, order.purchaseOrderId, status)
    await notificationEvents.purchaseStatus(businessId, updated)
    purchaseOrders.push(updated)
  }

  for (const order of purchaseOrders.slice(0, 2)) {
    const receipt = await receivingService.createReceiving(businessId, { purchaseOrderId: order.purchaseOrderId, items: order.items.map((item) => ({ productId: item.productId, receivedQuantity: item.quantity, damagedQuantity: 0, rejectedQuantity: 0, batchNumber: `CL-${tag}`, expiryDate: '' })), notes: 'Cartons checked and accepted' }, EMAIL)
    await notificationEvents.received(businessId, receipt)
  }

  const salesOrders = []
  const saleableProducts = products.filter((product) => product.currentStock >= 15)
  for (let i = 0; i < 9; i += 1) {
    const chosen = [saleableProducts[i % saleableProducts.length], saleableProducts[(i + 3) % saleableProducts.length]]
    const order = await salesOrderService.createOrder(businessId, { customerId: customers[i % customers.length].customerId, items: chosen.map((p) => ({ productId: p.productId, quantity: rand(2, 6), sellingPrice: p.sellingPrice, discount: rand(0, 60), tax: rand(15, 75) })), notes: pick(['Dispatch by road', 'Repeat wholesale buyer', 'Assorted sizes', 'Priority packing']) }, EMAIL)
    await notificationEvents.salesCreated(businessId, order)
    let updated = order
    if (i < 6) updated = await salesOrderService.completeOrder(businessId, order.orderId, EMAIL)
    else if (i === 6) updated = await salesOrderService.cancelOrder(businessId, order.orderId)
    if (updated.status !== 'Pending') await notificationEvents.salesStatus(businessId, updated)
    salesOrders.push(updated)
  }

  for (const [i, order] of salesOrders.filter((o) => o.status === 'Completed').entries()) {
    if (i > 3) break
    const amount = i < 2 ? order.totalAmount : Math.round(order.totalAmount * 0.5 * 100) / 100
    const payment = await paymentService.createPayment(businessId, { type: 'sale', referenceId: order.orderId, amount, paymentMethod: pick(['UPI', 'Bank transfer', 'Cash']), notes: i < 2 ? 'Invoice settled' : 'Part payment received' }, EMAIL)
    await notificationEvents.payment(businessId, payment)
  }

  const completed = salesOrders.find((o) => o.status === 'Completed')
  if (completed) {
    const line = completed.items[0]
    const returned = await returnService.createReturn(businessId, { type: 'sale', orderId: completed.orderId, productId: line.productId, quantity: 1, reason: 'Incorrect product', refundAmount: line.sellingPrice }, EMAIL)
    await notificationEvents.returned(businessId, returned)
  }

  const adjustmentProduct = products[2]
  const operation = await recordOperation(businessId, { section: 'Adjustments', productId: adjustmentProduct.productId, quantity: 6, reason: 'Physical rack count', createdBy: EMAIL })
  await notificationEvents.inventory(businessId, operation)

  const counts = {
    products: await Product.countDocuments({ business: user.business }), suppliers: await Supplier.countDocuments({ business: user.business }),
    customers: await Customer.countDocuments({ business: user.business }), purchaseOrders: await PurchaseOrder.countDocuments({ business: user.business }),
    salesOrders: await SalesOrder.countDocuments({ business: user.business }),
  }
  console.log(JSON.stringify({ email: EMAIL, added: { products: products.length, suppliers: suppliers.length, customers: customers.length, purchaseOrders: purchaseOrders.length, salesOrders: salesOrders.length }, workspaceTotals: counts }, null, 2))
  await disconnectDatabase()
}

run().catch(async (error) => { console.error(error); await disconnectDatabase(); process.exitCode = 1 })
