/**
 * Fills every module with realistic randomised sample data, through the real
 * services (so stock, totals and statuses stay consistent).
 *
 *   npm run seed:sample                 -> demo@stockroom.test / demo12345
 *   npm run seed:sample -- you@mail.com  -> that account's business
 *
 * Re-running resets the target business's catalogue + transactions first.
 */
import { connectDatabase, disconnectDatabase } from '../config/db.js'
import { User } from '../models/User.js'
import { Business } from '../models/Business.js'
import { Role, DEFAULT_ROLES } from '../models/Role.js'
import { Member } from '../models/Member.js'
import { Product } from '../models/Product.js'
import { Supplier } from '../models/Supplier.js'
import { Customer } from '../models/Customer.js'
import { PurchaseOrder } from '../models/PurchaseOrder.js'
import { Receiving } from '../models/Receiving.js'
import { SalesOrder } from '../models/SalesOrder.js'
import { Payment } from '../models/Payment.js'
import { StockTransaction } from '../models/StockTransaction.js'
import { Return } from '../models/Return.js'
import { productService } from '../services/productService.js'
import { supplierService } from '../services/supplierService.js'
import { customerService } from '../services/customerService.js'
import { purchaseOrderService } from '../services/purchaseOrderService.js'
import { receivingService } from '../services/receivingService.js'
import { salesOrderService } from '../services/salesOrderService.js'
import { paymentService } from '../services/paymentService.js'
import { recordOperation } from '../services/inventoryService.js'
import { returnService } from '../services/returnService.js'
import { userService } from '../services/userService.js'
import { updateBusiness } from '../services/businessService.js'

const arg = process.argv.slice(2).find((a) => a.includes('@'))
const EMAIL = (arg || 'demo@stockroom.test').toLowerCase()

const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const chance = (p) => Math.random() < p
const money = (n) => Math.round(n * 100) / 100
const future = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10)
const past = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)

let done = 0
let skipped = 0
async function step(label, fn) {
  try {
    const result = await fn()
    done += 1
    return result
  } catch (error) {
    skipped += 1
    console.warn(`  skip  ${label}: ${error.message}`)
    return null
  }
}

const PRODUCTS = [
  { name: 'Basmati Rice 5kg', sku: 'GRO-RICE-5', category: 'Grocery', brand: 'Kohinoor', unit: 'kg', purchasePrice: 380, sellingPrice: 520, currentStock: 40, minimumStock: 15 },
  { name: 'Sunflower Oil 1L', sku: 'GRO-OIL-1', category: 'Grocery', brand: 'Fortune', unit: 'litre', purchasePrice: 120, sellingPrice: 165, currentStock: 30, minimumStock: 12 },
  { name: 'Whole Wheat Atta 10kg', sku: 'GRO-ATTA-10', category: 'Grocery', brand: 'Aashirvaad', unit: 'kg', purchasePrice: 420, sellingPrice: 545, currentStock: 18, minimumStock: 10 },
  { name: 'Toor Dal 1kg', sku: 'GRO-DAL-1', category: 'Grocery', brand: 'Tata Sampann', unit: 'kg', purchasePrice: 130, sellingPrice: 175, currentStock: 8, minimumStock: 10 },
  { name: 'A4 Copier Paper Ream', sku: 'STA-PAPER-A4', category: 'Stationery', brand: 'JK', unit: 'box', purchasePrice: 240, sellingPrice: 320, currentStock: 25, minimumStock: 8 },
  { name: 'Blue Gel Pen (10 pack)', sku: 'STA-PEN-10', category: 'Stationery', brand: 'Cello', unit: 'box', purchasePrice: 60, sellingPrice: 95, currentStock: 90, minimumStock: 20 },
  { name: 'Spiral Notebook A5', sku: 'STA-NB-A5', category: 'Stationery', brand: 'Classmate', unit: 'piece', purchasePrice: 45, sellingPrice: 70, currentStock: 0, minimumStock: 15 },
  { name: 'Steel Water Bottle 750ml', sku: 'DRK-BOTTLE-750', category: 'Drinkware', brand: 'Milton', unit: 'piece', purchasePrice: 210, sellingPrice: 340, currentStock: 20, minimumStock: 6 },
  { name: 'Ceramic Coffee Mug 300ml', sku: 'DRK-MUG-300', category: 'Drinkware', brand: 'Borosil', unit: 'piece', purchasePrice: 95, sellingPrice: 160, currentStock: 44, minimumStock: 12 },
  { name: 'Cotton Tote Bag', sku: 'ACC-TOTE-STD', category: 'Accessories', brand: 'EcoRight', unit: 'piece', purchasePrice: 85, sellingPrice: 149, currentStock: 28, minimumStock: 10 },
  { name: 'Leather Card Holder', sku: 'ACC-CARD-LTH', category: 'Accessories', brand: 'Hidesign', unit: 'piece', purchasePrice: 260, sellingPrice: 450, currentStock: 12, minimumStock: 5 },
  { name: 'USB-C Fast Charger 25W', sku: 'ELE-CHRG-25', category: 'Electronics', brand: 'Anker', unit: 'piece', purchasePrice: 640, sellingPrice: 999, currentStock: 16, minimumStock: 6 },
  { name: 'Wireless Mouse', sku: 'ELE-MOUSE-BT', category: 'Electronics', brand: 'Logitech', unit: 'piece', purchasePrice: 520, sellingPrice: 799, currentStock: 22, minimumStock: 8 },
  { name: 'LED Bulb 9W (4 pack)', sku: 'HRD-BULB-9W', category: 'Hardware', brand: 'Philips', unit: 'box', purchasePrice: 180, sellingPrice: 260, currentStock: 50, minimumStock: 15 },
]

const SUPPLIERS = [
  { supplierName: 'Sharma Wholesale Traders', contactPerson: 'Rakesh Sharma', phone: '+91 98110 24455', email: 'rakesh@sharmawholesale.in', city: 'New Delhi', state: 'Delhi', taxNumber: '07ABCDE1234F1Z5', paymentTerms: 'Net 30' },
  { supplierName: 'Green Valley Foods Pvt Ltd', contactPerson: 'Meena Iyer', phone: '+91 99620 33110', email: 'orders@greenvalleyfoods.com', city: 'Coimbatore', state: 'Tamil Nadu', paymentTerms: 'Net 15' },
  { supplierName: 'Office Essentials Supply Co', contactPerson: 'Arjun Nair', phone: '+91 90040 55221', email: 'arjun@officeessentials.co.in', city: 'Bengaluru', state: 'Karnataka', paymentTerms: 'Net 7' },
  { supplierName: 'Craftline Exports', contactPerson: 'Priya Kapoor', phone: '+91 98330 77889', email: 'priya@craftline.in', city: 'Jaipur', state: 'Rajasthan', paymentTerms: 'Due on receipt' },
  { supplierName: 'TechDepot Distributors', contactPerson: 'Sameer Khan', phone: '+91 90900 12345', email: 'sameer@techdepot.in', city: 'Mumbai', state: 'Maharashtra', paymentTerms: 'Net 30' },
  { supplierName: 'Old Town Hardware', contactPerson: 'Iqbal Singh', phone: '+91 94250 66778', email: 'contact@oldtownhardware.in', city: 'Indore', state: 'Madhya Pradesh', paymentTerms: 'Net 15' },
]

const FIRST = ['Priya', 'Rahul', 'Ananya', 'Vikram', 'Sneha', 'Karthik', 'Divya', 'Arjun', 'Meera', 'Rohan', 'Nisha', 'Aditya', 'Pooja', 'Sanjay']
const LAST = ['Sharma', 'Patel', 'Reddy', 'Iyer', 'Nair', 'Gupta', 'Menon', 'Rao', 'Desai', 'Bose', 'Kulkarni', 'Chauhan']
const CITY = ['New Delhi', 'Mumbai', 'Bengaluru', 'Chennai', 'Pune', 'Hyderabad', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Lucknow']

const MEMBERS = [
  { name: 'Neha Verma', email: 'neha.verma@demosupply.co', role: 'Manager' },
  { name: 'Rohit Deshpande', email: 'rohit.deshpande@demosupply.co', role: 'Staff' },
  { name: 'Anjali Menon', email: 'anjali.menon@demosupply.co', role: 'Accountant' },
  { name: 'Vikram Rao', email: 'vikram.rao@demosupply.co', role: 'Salesperson' },
]

async function ensureBusiness() {
  let user = await User.findOne({ email: EMAIL })
  if (!user) {
    user = await User.create({ email: EMAIL, password: 'demo12345', role: 'owner', name: EMAIL.split('@')[0] })
    console.log(`Created owner account ${EMAIL} (password: demo12345)`)
  }
  let business = user.business ? await Business.findById(user.business) : null
  if (!business) {
    business = await Business.create({
      name: 'Demo Supply Co', industry: 'retail', businessType: 'retail',
      phone: '+91 98765 00000', email: 'hello@demosupply.co', address: '14 Market Road',
      city: 'New Delhi', state: 'Delhi', country: 'India', currency: 'INR', owner: user._id,
    })
    user.business = business._id
    await user.save()
    await Member.create({ business: business._id, account: user._id, name: user.name, email: user.email, roleId: 'ROLE-ADMIN', status: 'active' })
    console.log(`Created business "${business.name}"`)
  }
  const roleCount = await Role.countDocuments({ business: business._id })
  if (!roleCount) await Role.insertMany(DEFAULT_ROLES.map((r) => ({ ...r, business: business._id })))
  return business
}

async function reset(businessId) {
  for (const Model of [Product, Supplier, Customer, PurchaseOrder, Receiving, SalesOrder, Payment, StockTransaction, Return]) {
    await Model.deleteMany({ business: businessId })
  }
  await Member.deleteMany({ business: businessId, roleId: { $ne: 'ROLE-ADMIN' } })
}

async function run() {
  await connectDatabase()
  const business = await ensureBusiness()
  const bid = String(business._id)

  console.log(`\nResetting sample data for "${business.name}" (${EMAIL})...`)
  await reset(business._id)

  // ---- Products ----
  const products = []
  for (const def of PRODUCTS) {
    const p = await step(`product ${def.sku}`, () => productService.create(bid, def))
    if (p) products.push(p)
  }

  // ---- Suppliers (last one archived) ----
  const suppliers = []
  for (const def of SUPPLIERS) {
    const s = await step(`supplier ${def.supplierName}`, () => supplierService.create(bid, def))
    if (s) suppliers.push(s)
  }
  if (suppliers.length) await step('archive supplier', () => supplierService.archive(bid, suppliers.at(-1).supplierId))
  const activeSuppliers = suppliers.slice(0, -1)

  // ---- Customers (14, last 2 archived) ----
  const customers = []
  for (let i = 0; i < 14; i += 1) {
    const name = `${pick(FIRST)} ${pick(LAST)}`
    const c = await step(`customer ${name}`, () =>
      customerService.create(bid, {
        name,
        phone: `+91 9${rand(1000000000, 9999999999)}`.slice(0, 14),
        email: chance(0.8) ? `${name.toLowerCase().replace(/[^a-z]/g, '.')}@example.com` : '',
        city: pick(CITY),
        notes: chance(0.3) ? pick(['Wholesale buyer', 'Prefers UPI', 'Bulk orders monthly', 'Corporate account']) : '',
      }),
    )
    if (c) customers.push(c)
  }
  for (const c of customers.slice(-2)) await step('archive customer', () => customerService.archive(bid, c.customerId))
  const activeCustomers = customers.slice(0, -2)

  // ---- Team members + a role tweak ----
  for (const m of MEMBERS) {
    const created = await step(`member ${m.name}`, () => userService.createMember(bid, m))
    if (created && m.name === 'Vikram Rao') await step('deactivate member', () => userService.updateMember(bid, created.userId, { status: 'inactive' }))
  }
  await step('customise Manager role', () =>
    userService.setRolePermissions(bid, 'ROLE-MANAGER', ['view_dashboard', 'view_inventory', 'create_product', 'edit_product', 'delete_product', 'stock_in', 'stock_out', 'create_order', 'view_reports']),
  )

  // ---- Business settings ----
  await step('business settings', () => updateBusiness(bid, { settings: { lowStockLimit: 12, invoicePrefix: 'DSC', defaultPaymentMethod: 'UPI', taxEnabled: true, allowNegativeStock: false } }))

  // ---- Purchase orders ----
  const pos = []
  for (let i = 0; i < 9; i += 1) {
    const supplier = pick(activeSuppliers)
    const used = new Set()
    const items = []
    for (let j = 0; j < rand(1, 4); j += 1) {
      const product = pick(products)
      if (used.has(product.productId)) continue
      used.add(product.productId)
      items.push({
        productId: product.productId,
        quantity: rand(10, 60),
        purchasePrice: money(product.purchasePrice * (0.95 + Math.random() * 0.1)),
        discount: chance(0.3) ? rand(20, 120) : 0,
        tax: chance(0.5) ? rand(15, 90) : 0,
      })
    }
    if (!items.length) continue
    const po = await step(`purchase order ${i + 1}`, () =>
      purchaseOrderService.createOrder(bid, { supplierId: supplier.supplierId, items, shippingCharges: chance(0.5) ? rand(50, 300) : 0, expectedDeliveryDate: future(rand(3, 21)), notes: pick(['Standard restock', 'Urgent order', 'Monthly top-up', '']) }, EMAIL),
    )
    if (po) pos.push(po)
  }
  // statuses: most advance, one stays Draft, last one cancelled
  for (const po of pos.slice(1, -1)) {
    await step(`PO ${po.orderNumber} status`, () => purchaseOrderService.setStatus(bid, po.purchaseOrderId, pick(['Pending', 'Approved', 'Ordered', 'Ordered'])))
  }
  if (pos.length > 1) await step(`PO ${pos.at(-1).orderNumber} cancel`, () => purchaseOrderService.setStatus(bid, pos.at(-1).purchaseOrderId, 'Cancelled'))

  // ---- Receiving (full for most, partial for some) ----
  for (let k = 0; k < pos.length - 1; k += 1) {
    const po = await step('reload PO', () => purchaseOrderService.getOrder(bid, pos[k].purchaseOrderId))
    if (!po || po.status === 'Cancelled') continue
    const full = k % 3 !== 0
    const items = po.items.map((it) => {
      const qty = full ? it.quantity : Math.max(1, Math.floor(it.quantity / 2))
      return {
        productId: it.productId,
        receivedQuantity: qty,
        damagedQuantity: chance(0.15) && qty > 1 ? 1 : 0,
        rejectedQuantity: 0,
        batchNumber: chance(0.5) ? `B${rand(1000, 9999)}` : '',
        expiryDate: chance(0.3) ? future(rand(120, 400)) : '',
      }
    })
    await step(`receiving for ${po.orderNumber}`, () => receivingService.createReceiving(bid, { purchaseOrderId: po.purchaseOrderId, items, notes: full ? 'Full delivery received' : 'Partial delivery - remainder pending' }, EMAIL))
  }

  // ---- Sales orders ----
  const sos = []
  for (let i = 0; i < 16; i += 1) {
    const customer = pick(activeCustomers)
    const used = new Set()
    const items = []
    for (let j = 0; j < rand(1, 3); j += 1) {
      const product = pick(products)
      if (used.has(product.productId)) continue
      used.add(product.productId)
      items.push({
        productId: product.productId,
        quantity: rand(1, 5),
        sellingPrice: money(product.sellingPrice * (0.98 + Math.random() * 0.06)),
        discount: chance(0.25) ? rand(10, 50) : 0,
        tax: chance(0.4) ? rand(5, 40) : 0,
      })
    }
    if (!items.length) continue
    const so = await step(`sales order ${i + 1}`, () => salesOrderService.createOrder(bid, { customerId: customer.customerId, items, notes: pick(['', 'Counter sale', 'Phone order', 'Repeat customer', 'Delivery requested']) }, EMAIL))
    if (so) sos.push(so)
  }
  for (const so of sos) {
    const roll = Math.random()
    if (roll < 0.62) await step(`complete ${so.orderNumber}`, () => salesOrderService.completeOrder(bid, so.orderId, EMAIL))
    else if (roll < 0.8) await step(`cancel ${so.orderNumber}`, () => salesOrderService.cancelOrder(bid, so.orderId))
  }

  // ---- Payments (sales + purchases, full + partial) ----
  const completedSales = (await salesOrderService.listOrders(bid, {})).filter((o) => o.status === 'Completed')
  for (const o of completedSales) {
    if (chance(0.25)) continue
    const full = chance(0.6)
    const amount = full ? o.totalAmount : money(o.totalAmount * (0.3 + Math.random() * 0.4))
    await step(`payment (sale) ${o.orderNumber}`, () => paymentService.createPayment(bid, { type: 'sale', referenceId: o.orderId, amount, paymentMethod: pick(['Cash', 'UPI', 'Card', 'Bank transfer']), paymentDate: past(rand(0, 25)), notes: full ? 'Paid in full' : 'Advance payment' }, EMAIL))
  }
  const receivedPOs = (await purchaseOrderService.listOrders(bid, {})).filter((o) => ['Received', 'Partially Received'].includes(o.status))
  for (const o of receivedPOs) {
    if (chance(0.35)) continue
    const full = chance(0.5)
    const amount = full ? o.totalAmount : money(o.totalAmount * 0.5)
    await step(`payment (purchase) ${o.orderNumber}`, () => paymentService.createPayment(bid, { type: 'purchase', referenceId: o.purchaseOrderId, amount, paymentMethod: pick(['Bank transfer', 'UPI', 'Credit']), paymentDate: past(rand(0, 25)), notes: full ? 'Settled' : 'Part payment' }, EMAIL))
  }

  // ---- Manual stock operations (Stock In / Out / Adjustment) ----
  const ops = [
    ['Stock In', 'Opening stock adjustment', () => rand(5, 20)],
    ['Stock Out', 'Damaged in storage', () => rand(1, 4)],
    ['Stock Out', 'Display / sample unit', () => rand(1, 2)],
    ['Adjustments', 'Physical count correction', null],
    ['Stock In', 'Supplier goodwill top-up', () => rand(3, 10)],
    ['Adjustments', 'Cycle count correction', null],
    ['Stock Out', 'Expired stock written off', () => rand(1, 3)],
  ]
  for (const [section, reason, qtyFn] of ops) {
    const product = pick(products)
    const fresh = await step('reload product', () => productService.get(bid, product.productId))
    if (!fresh) continue
    let quantity
    if (section === 'Adjustments') quantity = Math.max(0, fresh.currentStock + rand(-3, 6))
    else if (section === 'Stock Out') quantity = Math.min(qtyFn(), fresh.currentStock)
    else quantity = qtyFn()
    if (section === 'Stock Out' && quantity <= 0) continue
    await step(`${section} ${product.sku}`, () => recordOperation(bid, { section, productId: product.productId, quantity, reason, createdBy: EMAIL }))
  }

  // ---- Returns (sales + purchase) ----
  const salesForReturn = (await salesOrderService.listOrders(bid, {})).filter((o) => o.status === 'Completed')
  for (const o of salesForReturn.slice(0, 3)) {
    const line = pick(o.items)
    await step(`sales return ${o.orderNumber}`, () =>
      returnService.createReturn(bid, { type: 'sale', orderId: o.orderId, productId: line.productId, quantity: 1, reason: pick(['Damaged product', 'Defective product', 'Incorrect product']), refundAmount: money(line.total / line.quantity) }, EMAIL),
    )
  }
  const purchasesForReturn = (await purchaseOrderService.listOrders(bid, {})).filter((o) => ['Received', 'Partially Received'].includes(o.status))
  for (const o of purchasesForReturn.slice(0, 2)) {
    const line = pick(o.items)
    await step(`purchase return ${o.orderNumber}`, () =>
      returnService.createReturn(bid, { type: 'purchase', orderId: o.purchaseOrderId, productId: line.productId, quantity: 1, reason: 'Defective product', refundAmount: money(line.purchasePrice) }, EMAIL),
    )
  }

  // ---- Summary ----
  const counts = {
    products: await Product.countDocuments({ business: business._id }),
    suppliers: await Supplier.countDocuments({ business: business._id }),
    customers: await Customer.countDocuments({ business: business._id }),
    purchaseOrders: await PurchaseOrder.countDocuments({ business: business._id }),
    receivings: await Receiving.countDocuments({ business: business._id }),
    salesOrders: await SalesOrder.countDocuments({ business: business._id }),
    payments: await Payment.countDocuments({ business: business._id }),
    stockTransactions: await StockTransaction.countDocuments({ business: business._id }),
    returns: await Return.countDocuments({ business: business._id }),
    members: await Member.countDocuments({ business: business._id }),
    roles: await Role.countDocuments({ business: business._id }),
  }
  console.log(`\n${done} operations succeeded, ${skipped} skipped.`)
  console.table(counts)
  console.log(`\nSign in as ${EMAIL}${EMAIL === 'demo@stockroom.test' ? ' / demo12345' : ''}`)

  await disconnectDatabase()
  process.exit(0)
}

run().catch(async (error) => {
  console.error(error)
  await disconnectDatabase()
  process.exit(1)
})
