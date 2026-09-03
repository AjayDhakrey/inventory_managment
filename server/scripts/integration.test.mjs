/* Full MERN integration check against an in-memory MongoDB replica set. */
import { MongoMemoryReplSet } from 'mongodb-memory-server'

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
process.env.MONGODB_URI = replSet.getUri()
process.env.JWT_SECRET = 'integration_test_secret'
process.env.NODE_ENV = 'test'

const { connectDatabase, disconnectDatabase } = await import('../config/db.js')
const { createApp } = await import('../app.js')

await connectDatabase()
const app = createApp()
const server = app.listen(4611)
const base = 'http://localhost:4611/api'

let pass = 0
let fail = 0
const check = (label, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ok   ${label}`) }
  else { fail += 1; console.log(`  FAIL ${label} ${extra}`) }
}

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

async function callForm(path, token, fileName, content) {
  const form = new FormData()
  form.append('file', new Blob([content], { type: 'text/csv' }), fileName)
  const res = await fetch(base + path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

try {
  // ---- auth ----
  const reg = await call('POST', '/auth/register', { body: { email: 'owner@test.com', password: 'password123', role: 'owner' } })
  check('register 201', reg.status === 201, JSON.stringify(reg.json))
  const badLogin = await call('POST', '/auth/login', { body: { email: 'owner@test.com', password: 'wrong' } })
  check('login wrong password 401', badLogin.status === 401)
  const login = await call('POST', '/auth/login', { body: { email: 'owner@test.com', password: 'password123' } })
  check('login 200 + token', login.status === 200 && !!login.json.data.token)
  check('login never returns password', !JSON.stringify(login.json).includes('password123') || !login.json.data.user.password)
  let token = login.json.data.token
  check('no business yet', login.json.data.business === null)

  const noAuth = await call('GET', '/products')
  check('products without token 401', noAuth.status === 401)
  const noBiz = await call('GET', '/products', { token })
  check('products before business 403', noBiz.status === 403)

  // ---- business ----
  const biz = await call('POST', '/businesses', { token, body: { name: 'Test Co', industry: 'retail', businessType: 'retail', city: 'Delhi', country: 'India', currency: 'INR' } })
  check('create business 201', biz.status === 201, JSON.stringify(biz.json))
  token = biz.json.data.token
  const businessId = biz.json.data.business.businessId

  // ---- isolation: a second business must not see the first's data ----
  await call('POST', '/auth/register', { body: { email: 'other@test.com', password: 'password123' } })
  const otherLogin = await call('POST', '/auth/login', { body: { email: 'other@test.com', password: 'password123' } })
  const otherBiz = await call('POST', '/businesses', { token: otherLogin.json.data.token, body: { name: 'Other Co', industry: 'retail', businessType: 'retail', city: 'Mumbai', country: 'India', currency: 'INR' } })
  const otherToken = otherBiz.json.data.token

  // ---- products ----
  const prod = await call('POST', '/products', { token, body: { name: 'Widget', sku: 'wid-1', category: 'Tools', sellingPrice: 50, purchasePrice: 20, currentStock: 5, minimumStock: 3 } })
  check('create product 201', prod.status === 201, JSON.stringify(prod.json))
  check('product sku uppercased', prod.json.data.sku === 'WID-1')
  const productId = prod.json.data.productId
  const dupSku = await call('POST', '/products', { token, body: { name: 'Widget 2', sku: 'WID-1', category: 'Tools', sellingPrice: 10 } })
  check('duplicate SKU 409', dupSku.status === 409)
  const otherProducts = await call('GET', '/products', { token: otherToken })
  check('business isolation: other business sees 0 products', otherProducts.json.data.length === 0)

  // ---- supplier + customer ----
  const sup = await call('POST', '/suppliers', { token, body: { supplierName: 'Acme', phone: '+911234567' } })
  check('create supplier 201', sup.status === 201, JSON.stringify(sup.json))
  const supplierId = sup.json.data.supplierId

  // ---- validated product import + partial failures + duplicate merge ----
  const csv = 'Product Name,SKU,Barcode,Category,Quantity,Purchase Price,Selling Price,Wholesale Price,GST %,HSN Code,Supplier\nBulk Shirt,BULK-1,89010001,Clothing,7,100,150,130,5,6205,Acme\nInvalid Shirt,,89010002,Clothing,3,80,120,100,5,6205,Acme'
  const extracted = await callForm('/product-imports/extract', token, 'products.csv', csv)
  check('bulk import extracts CSV preview', extracted.status === 200 && extracted.json.data.rows.length === 2, JSON.stringify(extracted.json))
  check('bulk import validation flags invalid row', extracted.json.data.summary.valid === 1 && extracted.json.data.summary.invalid === 1)
  const imported = await call('POST', '/product-imports/confirm', { token, body: { fileName: 'products.csv', fileType: 'csv', supplierId, purchaseReference: 'PO-BULK-1', rows: extracted.json.data.rows } })
  check('bulk import accepts valid rows and reports failures', imported.status === 201 && imported.json.data.counts.created === 1 && imported.json.data.failures.length === 1, JSON.stringify(imported.json))
  const extractedAgain = await callForm('/product-imports/extract', token, 'products.csv', csv)
  extractedAgain.json.data.rows[0].duplicateAction = 'merge'
  const merged = await call('POST', '/product-imports/confirm', { token, body: { fileName: 'products.csv', fileType: 'csv', rows: extractedAgain.json.data.rows } })
  check('bulk duplicate merge adds inventory', merged.status === 201 && merged.json.data.counts.merged === 1)
  const bulkProduct = await call('GET', '/products', { token })
  check('bulk import stock and business product persisted', bulkProduct.json.data.find((item) => item.sku === 'BULK-1')?.currentStock === 14)
  const importHistory = await call('GET', '/product-imports/history', { token })
  check('bulk import history is audited', importHistory.status === 200 && importHistory.json.data.length === 2)
  const isolatedHistory = await call('GET', '/product-imports/history', { token: otherToken })
  check('bulk import history business isolation', isolatedHistory.status === 200 && isolatedHistory.json.data.length === 0)

  const cust = await call('POST', '/customers', { token, body: { name: 'Riya', phone: '+919876543' } })
  check('create customer 201', cust.status === 201)
  const customerId = cust.json.data.customerId

  // ---- purchase order + receiving (stock up) ----
  const po = await call('POST', '/purchase-orders', { token, body: { supplierId, items: [{ productId, quantity: 10, purchasePrice: 20 }] } })
  check('create PO 201', po.status === 201, JSON.stringify(po.json))
  check('PO total computed server-side', po.json.data.totalAmount === 200)
  const poId = po.json.data.purchaseOrderId
  const pending = await call('GET', '/receiving/pending-orders', { token })
  check('pending order listed', pending.json.data.some((o) => o.purchaseOrderId === poId))
  const zeroReceiving = await call('POST', '/receiving', { token, body: { purchaseOrderId: poId, items: [{ productId, receivedQuantity: 0 }] } })
  check('zero-quantity receiving rejected', zeroReceiving.status === 400)
  const duplicateReceiving = await call('POST', '/receiving', { token, body: { purchaseOrderId: poId, items: [{ productId, receivedQuantity: 1 }, { productId, receivedQuantity: 1 }] } })
  check('duplicate receiving product rejected', duplicateReceiving.status === 400)
  const recv = await call('POST', '/receiving', { token, body: { purchaseOrderId: poId, items: [{ productId, receivedQuantity: 10, damagedQuantity: 0, rejectedQuantity: 0 }] } })
  check('receiving 201', recv.status === 201, JSON.stringify(recv.json))
  let p = await call('GET', `/products/${productId}`, { token })
  check('stock increased 5 -> 15 after receiving', p.json.data.currentStock === 15, `got ${p.json.data.currentStock}`)

  // ---- sales order + completion (stock down, transaction) ----
  const so = await call('POST', '/sales-orders', { token, body: { customerId, items: [{ productId, quantity: 4, sellingPrice: 50 }] } })
  check('create SO 201', so.status === 201, JSON.stringify(so.json))
  const soId = so.json.data.orderId
  check('SO total computed server-side', so.json.data.totalAmount === 200)
  const complete = await call('PATCH', `/sales-orders/${soId}/complete`, { token })
  check('complete SO 200', complete.status === 200, JSON.stringify(complete.json))
  p = await call('GET', `/products/${productId}`, { token })
  check('stock decreased 15 -> 11 after sale', p.json.data.currentStock === 11, `got ${p.json.data.currentStock}`)
  const overSell = await call('POST', '/sales-orders', { token, body: { customerId, items: [{ productId, quantity: 999, sellingPrice: 50 }] } })
  const overComplete = overSell.status === 201 ? await call('PATCH', `/sales-orders/${overSell.json.data.orderId}/complete`, { token }) : { status: 0 }
  check('cannot complete sale beyond stock', overComplete.status === 400)
  const pendingReturn = await call('POST', '/returns', { token, body: { type: 'sale', orderId: overSell.json.data.orderId, productId, quantity: 1 } })
  check('pending sale cannot be returned', pendingReturn.status === 400)

  // ---- payment ----
  const payAll = await call('POST', '/payments', { token, body: { type: 'sale', referenceId: soId, amount: 200, paymentMethod: 'Cash' } })
  check('payment 201', payAll.status === 201, JSON.stringify(payAll.json))
  const payOver = await call('POST', '/payments', { token, body: { type: 'sale', referenceId: soId, amount: 1, paymentMethod: 'Cash' } })
  check('payment beyond balance rejected 400', payOver.status === 400)
  const soAfter = await call('GET', `/sales-orders/${soId}`, { token })
  check('order paymentStatus -> Paid', soAfter.json.data.paymentStatus === 'Paid')

  // ---- return (stock back up) ----
  const ret = await call('POST', '/returns', { token, body: { type: 'sale', orderId: soId, productId, quantity: 1, reason: 'Damaged product' } })
  check('sales return 201', ret.status === 201, JSON.stringify(ret.json))
  const excessReturn = await call('POST', '/returns', { token, body: { type: 'sale', orderId: soId, productId, quantity: 4, reason: 'Other' } })
  check('cumulative returns cannot exceed sold quantity', excessReturn.status === 400)
  p = await call('GET', `/products/${productId}`, { token })
  check('stock 11 -> 12 after sales return', p.json.data.currentStock === 12, `got ${p.json.data.currentStock}`)

  // ---- POS checkout: backend totals, split payment, invoice, and stock ----
  const pos = await call('POST', '/pos/checkout', { token, body: {
    billingType: 'retail', customerId,
    items: [{ productId, quantity: 2, unitPrice: 50, discount: 0 }],
    discount: { type: 'fixed', value: 0 },
    payments: [{ method: 'Cash', amount: 50 }, { method: 'UPI', amount: 55, reference: 'UTR-TEST' }],
  } })
  check('POS checkout 201', pos.status === 201, JSON.stringify(pos.json))
  check('POS GST and total calculated on backend', pos.json.data.invoice.tax === 5 && pos.json.data.invoice.totalAmount === 105, JSON.stringify(pos.json.data?.invoice))
  check('POS split payment marked paid', pos.json.data.invoice.amountPaid === 105 && pos.json.data.invoice.paymentStatus === 'Paid')
  const invoiceId = pos.json.data.invoice.orderId
  p = await call('GET', `/products/${productId}`, { token })
  check('POS reduced inventory 12 -> 10', p.json.data.currentStock === 10, `got ${p.json.data.currentStock}`)
  const invoice = await call('GET', `/pos/invoices/${invoiceId}`, { token })
  check('POS invoice can be reprinted', invoice.status === 200 && invoice.json.data.invoiceNumber === pos.json.data.invoice.invoiceNumber)
  const otherInvoice = await call('GET', `/pos/invoices/${invoiceId}`, { token: otherToken })
  check('POS invoice business isolation', otherInvoice.status === 404)
  const creditPos = await call('POST', '/pos/checkout', { token, body: { billingType: 'wholesale', customerId, items: [{ productId, quantity: 1, unitPrice: 50 }], payments: [{ method: 'Cash', amount: 20 }, { method: 'Pay Later', amount: 33 }] } })
  check('POS wholesale partial payment', creditPos.status === 201 && creditPos.json.data.invoice.paymentStatus === 'Partially Paid' && creditPos.json.data.invoice.balanceDue === 33, JSON.stringify(creditPos.json))
  const creditInvoiceId = creditPos.json.data.invoice.orderId
  const settleCredit = await call('POST', '/payments', { token, body: { type: 'sale', referenceId: creditInvoiceId, amount: 33, paymentMethod: 'UPI', reference: 'SETTLE-1' } })
  const settledInvoice = await call('GET', `/pos/invoices/${creditInvoiceId}`, { token })
  check('later payment settles POS outstanding', settleCredit.status === 201 && settledInvoice.json.data.balanceDue === 0 && settledInvoice.json.data.paymentStatus === 'Paid')

  // ---- inventory operation ----
  const adj = await call('POST', '/inventory/operations', { token, body: { section: 'Adjustments', productId, quantity: 100 } })
  check('adjustment 201', adj.status === 201)
  const txns = await call('GET', '/inventory/transactions', { token })
  check('stock transaction history present', txns.json.data.length >= 3)

  // ---- persistent, recipient-scoped notifications ----
  const stockOut = await call('POST', '/inventory/operations', { token, body: { section: 'Stock Out', productId, quantity: 100, reason: 'notification test' } })
  check('stock out to zero succeeds', stockOut.status === 201)
  const notifications = await call('GET', '/notifications', { token })
  const outAlert = notifications.json.data.items.find((item) => item.type === 'OUT_OF_STOCK')
  check('out-of-stock notification generated', notifications.status === 200 && !!outAlert, JSON.stringify(notifications.json))
  check('notification unread badge persisted', notifications.json.data.unreadCount > 0)
  const isolatedNotification = await call('PATCH', `/notifications/${outAlert.notificationId}/read`, { token: otherToken })
  check('notification business/recipient isolation', isolatedNotification.status === 404)
  const readNotification = await call('PATCH', `/notifications/${outAlert.notificationId}/read`, { token })
  check('mark notification read', readNotification.status === 200 && !!readNotification.json.data.readAt)
  const afterRead = await call('GET', '/notifications', { token })
  check('read state survives a new request', afterRead.json.data.items.find((item) => item.notificationId === outAlert.notificationId)?.readAt)
  const readAll = await call('PATCH', '/notifications/read-all', { token })
  const afterReadAll = await call('GET', '/notifications', { token })
  check('mark all read clears unread count', readAll.status === 200 && afterReadAll.json.data.unreadCount === 0)
  const dismissNotification = await call('DELETE', `/notifications/${outAlert.notificationId}`, { token })
  const afterDismiss = await call('GET', '/notifications', { token })
  check('dismiss removes notification from active list', dismissNotification.status === 200 && !afterDismiss.json.data.items.some((item) => item.notificationId === outAlert.notificationId))

  // ---- users / roles ----
  const roles = await call('GET', '/users/roles/all', { token })
  check('default roles seeded', roles.json.data.length === 5)
  const member = await call('POST', '/users', { token, body: { name: 'Sam', email: 'sam@test.com', role: 'Manager' } })
  check('add team member 201', member.status === 201, JSON.stringify(member.json))

  const invited = await call('POST', '/users', { token, body: { name: 'Sales Agent', email: 'sales.agent@test.com', role: 'Salesperson' } })
  check('new team member starts invitation pending', invited.status === 201 && invited.json.data.status === 'pending')
  const teamRegistration = await call('POST', '/auth/register', { body: { email: 'sales.agent@test.com', password: 'password123', role: 'team' } })
  check('team signup claims invitation and business', teamRegistration.status === 201 && teamRegistration.json.data.business.businessId === businessId)
  check('team session exposes assigned role', teamRegistration.json.data.user.roleId === 'ROLE-SALESPERSON' && teamRegistration.json.data.user.permissions.includes('create_order'))
  const teamToken = teamRegistration.json.data.token
  const linkedMembers = await call('GET', '/users', { token })
  const linked = linkedMembers.json.data.find((item) => item.email === 'sales.agent@test.com')
  check('claimed member reflects active in Users', linked.status === 'active' && !!linked.account)
  const deniedInventory = await call('GET', '/products', { token: teamToken })
  check('team permission denies inventory', deniedInventory.status === 403)
  const allowedSales = await call('GET', '/sales-orders', { token: teamToken })
  check('team permission allows assigned sales module', allowedSales.status === 200)
  const allowedPos = await call('GET', '/pos/invoices', { token: teamToken })
  check('salesperson permission allows POS', allowedPos.status === 200)
  const allowedCatalog = await call('GET', '/pos/catalog', { token: teamToken })
  check('salesperson can load scoped POS catalog', allowedCatalog.status === 200)
  const allowedPosCustomers = await call('GET', '/pos/customers', { token: teamToken })
  check('salesperson can load POS customers without create_order', allowedPosCustomers.status === 200 && allowedPosCustomers.json.data.some((item) => item.customerId === customerId))
  const deniedOverride = await call('POST', '/pos/checkout', { token: teamToken, body: { customerId, items: [{ productId, quantity: 1, unitPrice: 1 }], payments: [{ method: 'Cash', amount: 1 }] } })
  check('salesperson price override rejected by backend', deniedOverride.status === 400)
  const deniedUsers = await call('GET', '/users', { token: teamToken })
  check('team permission denies user management', deniedUsers.status === 403)
  await call('PATCH', `/users/${linked.userId}`, { token, body: { status: 'inactive' } })
  const inactiveTeam = await call('GET', '/auth/me', { token: teamToken })
  check('deactivated team account cannot continue', inactiveTeam.status === 403)

  // ---- reports ----
  const report = await call('GET', '/reports/summary', { token })
  check('report summary', report.status === 200 && report.json.data.productCount === 2, JSON.stringify(report.json))

  // ---- PERSISTENCE: disconnect, reconnect, re-query (simulates backend restart) ----
  await disconnectDatabase()
  await connectDatabase()
  const afterRestart = await call('GET', '/products', { token })
  check('data persists after DB reconnect', afterRestart.status === 200 && afterRestart.json.data.some((item) => item.productId === productId) && afterRestart.json.data.some((item) => item.sku === 'BULK-1'), JSON.stringify(afterRestart.json))
  const custAfter = await call('GET', '/customers', { token })
  check('customer persists after reconnect', custAfter.json.data.some((c) => c.customerId === customerId))
  check('business isolation held (businessId stable)', afterRestart.json.data.every((x) => x.businessId === businessId), JSON.stringify(afterRestart.json.data))
} catch (error) {
  fail += 1
  console.error('THREW:', error)
} finally {
  server.close()
  await disconnectDatabase()
  await replSet.stop()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
