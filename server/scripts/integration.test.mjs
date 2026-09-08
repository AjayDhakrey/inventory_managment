/* Full MERN integration check against an in-memory MongoDB replica set. */
import { MongoMemoryReplSet } from 'mongodb-memory-server'

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
process.env.MONGODB_URI = replSet.getUri()
process.env.JWT_SECRET = 'integration_test_secret'
process.env.NODE_ENV = 'test'

const { connectDatabase, disconnectDatabase } = await import('../config/db.js')
const { createApp } = await import('../app.js')
const { mapPositionedPdfItems } = await import('../services/productImportService.js')

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
  const pdfHeaders = ['Product Name', 'ParentSKU', 'SKU', 'Barcode', 'Category', 'Brand', 'Size', 'Color', 'Quantity', 'Cost Price', 'Selling', 'Wholesale Price', 'GST %', 'HSN Code', 'Supplier', 'Minimum Stock', 'Reorder Point', 'Target Stock', 'Reorder Quantity']
  const pdfValues = ['Cotton Shirt', 'SHIRT-STYLE', 'SHIRT-CTN-BLA-S', '890000000001', 'Shirts', 'Acme', 'S', 'Black', '4', '500', '849', '700', '5', '5208', 'Cloth Source', '2', '4', '12', '8']
  const positionedPdf = pdfHeaders.map((str, index) => ({ str, transform: [1, 0, 0, 1, 20 + index * 70, 700], width: 48 })).concat([{ str: 'Price', transform: [1, 0, 0, 1, 20 + 10 * 70, 690], width: 35 }], pdfValues.map((str, index) => ({ str, transform: [1, 0, 0, 1, 20 + index * 70, 670], width: 46 })))
  const mappedPdf = mapPositionedPdfItems(positionedPdf)
  check('PDF header-coordinate mapping preserves selling price GST and HSN', mappedPdf.rows.length === 1 && mappedPdf.rows[0].sellingPrice === '849' && mappedPdf.rows[0].gstRate === '5' && mappedPdf.rows[0].hsnCode === '5208', JSON.stringify(mappedPdf))
  check('PDF mapping debug exposes header-to-field anchors', mappedPdf.debug.headerMap.some((item) => item.field === 'sellingPrice') && mappedPdf.debug.headerMap.some((item) => item.field === 'gstRate') && mappedPdf.debug.headerMap.some((item) => item.field === 'hsnCode'))
  // ---- auth ----
  const reg = await call('POST', '/auth/register', { body: { email: 'owner@test.com', password: 'Str0ng-Test-Pass!9', role: 'owner' } })
  check('register 201', reg.status === 201, JSON.stringify(reg.json))
  const badLogin = await call('POST', '/auth/login', { body: { email: 'owner@test.com', password: 'wrong' } })
  check('login wrong password 401', badLogin.status === 401)
  const login = await call('POST', '/auth/login', { body: { email: 'owner@test.com', password: 'Str0ng-Test-Pass!9' } })
  check('login 200 + token', login.status === 200 && !!login.json.data.token)
  check('login never returns password', !JSON.stringify(login.json).includes('Str0ng-Test-Pass!9') || !login.json.data.user.password)
  let token = login.json.data.token
  check('no business yet', login.json.data.business === null)
  check('new owner starts persisted onboarding', login.json.data.user.onboarding.status === 'pending' && login.json.data.user.onboarding.currentStep === 1)
  const savedOnboarding = await call('PATCH', '/auth/onboarding', { token, body: { currentStep: 3, ownerName: 'New Owner', draft: { businessName: 'Test Co', city: 'Delhi', industry: 'Retail' } } })
  const resumedLogin = await call('POST', '/auth/login', { body: { email: 'owner@test.com', password: 'Str0ng-Test-Pass!9' } })
  check('onboarding progress survives logout/login', savedOnboarding.status === 200 && resumedLogin.json.data.user.onboarding.currentStep === 3 && resumedLogin.json.data.user.onboarding.draft.businessName === 'Test Co')

  const noAuth = await call('GET', '/products')
  check('products without token 401', noAuth.status === 401)
  const noBiz = await call('GET', '/products', { token })
  check('products before business 403', noBiz.status === 403)

  // ---- business ----
  const biz = await call('POST', '/businesses', { token, body: { name: 'Test Co', industry: 'retail', businessType: 'retail', city: 'Delhi', country: 'India', currency: 'INR' } })
  check('create business 201', biz.status === 201, JSON.stringify(biz.json))
  token = biz.json.data.token
  const businessId = biz.json.data.business.businessId
  const repeatedBusiness = await call('POST', '/businesses', { token, body: { name: 'Test Co', industry: 'retail', businessType: 'retail', city: 'Delhi', country: 'India', currency: 'INR' } })
  check('repeated onboarding Continue does not duplicate business', repeatedBusiness.status === 201 && repeatedBusiness.json.data.business.businessId === businessId)
  const completedOnboarding = await call('PATCH', '/auth/onboarding', { token, body: { currentStep: 7, complete: true } })
  check('completed onboarding persists and routes existing owner forward', completedOnboarding.status === 200 && completedOnboarding.json.data.user.onboarding.status === 'completed' && !!completedOnboarding.json.data.user.onboarding.completedAt)

  // ---- isolation: a second business must not see the first's data ----
  await call('POST', '/auth/register', { body: { email: 'other@test.com', password: 'Str0ng-Test-Pass!9' } })
  const otherLogin = await call('POST', '/auth/login', { body: { email: 'other@test.com', password: 'Str0ng-Test-Pass!9' } })
  const otherBiz = await call('POST', '/businesses', { token: otherLogin.json.data.token, body: { name: 'Other Co', industry: 'retail', businessType: 'retail', city: 'Mumbai', country: 'India', currency: 'INR' } })
  const otherToken = otherBiz.json.data.token

  // ---- clothing color master: legacy compatibility, CRUD, stock, security ----
  await call('POST', '/auth/register', { body: { email: 'clothing@test.com', password: 'Str0ng-Test-Pass!9' } })
  const clothingLogin = await call('POST', '/auth/login', { body: { email: 'clothing@test.com', password: 'Str0ng-Test-Pass!9' } })
  const clothingBiz = await call('POST', '/businesses', { token: clothingLogin.json.data.token, body: { name: 'Clothing Co', industry: 'Clothing', businessType: 'Retail', city: 'Delhi', country: 'India', currency: 'INR' } })
  const clothingToken = clothingBiz.json.data.token
  const legacyProduct = await call('POST', '/products', { token: clothingToken, body: { name: 'Legacy Shirt', sku: 'LEG-1', category: 'Shirts', sellingPrice: 500, currentStock: 90, color: 'Black', size: 'M' } })
  const secondBlackProduct = await call('POST', '/products', { token: clothingToken, body: { name: 'Black Denim Jacket', sku: 'DEN-BLK-2', category: 'Jackets', sellingPrice: 1500, currentStock: 10, color: 'Black', size: 'L' } })
  check('existing manual product color remains valid', legacyProduct.status === 201 && legacyProduct.json.data.color === 'Black')
  const importedColors = await call('GET', '/colors', { token: clothingToken })
  const black = importedColors.json.data.find((color) => color.name === 'Black')
  check('legacy colors become reusable master colors', importedColors.status === 200 && !!black)
  check('color-wise stock totals multiple products', black.stockUnits === 100 && black.productCount === 2, JSON.stringify(black))
  check('color response includes exact product details', black.products.some((product) => product.productId === secondBlackProduct.json.data.productId && product.sku === 'DEN-BLK-2' && product.category === 'Jackets' && product.size === 'L' && product.currentStock === 10), JSON.stringify(black.products))
  for (let index = 0; index < 24; index += 1) {
    await call('POST', '/products', { token: clothingToken, body: { name: `Scrollable Black Variant ${index + 1}`, sku: `SCROLL-BLK-${index + 1}`, category: 'Shirts', sellingPrice: 400, currentStock: 1, color: 'Black', size: index % 2 ? 'M' : 'L' } })
  }
  const overflowingColors = await call('GET', '/colors?search=black', { token: clothingToken })
  const overflowingBlack = overflowingColors.json.data.find((color) => color.name === 'Black')
  check('oversized modal payload includes first through final product and totals', overflowingBlack.products.length === 26 && overflowingBlack.stockUnits === 124 && overflowingBlack.products.some((product) => product.sku === 'SCROLL-BLK-24'), JSON.stringify(overflowingBlack))
  const navy = await call('POST', '/colors', { token: clothingToken, body: { name: 'Navy Blue', hexCode: '#000080' } })
  check('add color', navy.status === 201 && navy.json.data.hexCode === '#000080', JSON.stringify(navy.json))
  const duplicateColor = await call('POST', '/colors', { token: clothingToken, body: { name: ' navy blue ' } })
  check('duplicate color prevented per business', duplicateColor.status === 409)
  const searchedColors = await call('GET', '/colors?search=navy', { token: clothingToken })
  check('business-scoped color search', searchedColors.status === 200 && searchedColors.json.data.length === 1 && searchedColors.json.data[0].name === 'Navy Blue')
  const productNameSearch = await call('GET', '/colors?search=denim%20jacket', { token: clothingToken })
  check('search color by product name', productNameSearch.status === 200 && productNameSearch.json.data.length === 1 && productNameSearch.json.data[0].name === 'Black' && productNameSearch.json.data[0].matchedProducts[0].name === 'Black Denim Jacket')
  const skuSearch = await call('GET', '/colors?search=DEN-BLK-2', { token: clothingToken })
  check('search color by SKU', skuSearch.status === 200 && skuSearch.json.data.length === 1 && skuSearch.json.data[0].matchedProducts[0].sku === 'DEN-BLK-2')
  const renamed = await call('PATCH', `/colors/${black.colorId}`, { token: clothingToken, body: { name: 'Jet Black', hexCode: '#000000' } })
  const renamedProduct = await call('GET', `/products/${legacyProduct.json.data.productId}`, { token: clothingToken })
  check('rename color', renamed.status === 200 && renamed.json.data.name === 'Jet Black')
  check('rename propagates to existing products', renamedProduct.json.data.color === 'Jet Black')
  const disabled = await call('PATCH', `/colors/${black.colorId}`, { token: clothingToken, body: { status: 'inactive' } })
  check('enable/disable color', disabled.status === 200 && disabled.json.data.status === 'inactive')

  await call('POST', '/auth/register', { body: { email: 'clothing.other@test.com', password: 'Str0ng-Test-Pass!9' } })
  const clothingOtherLogin = await call('POST', '/auth/login', { body: { email: 'clothing.other@test.com', password: 'Str0ng-Test-Pass!9' } })
  const clothingOtherBiz = await call('POST', '/businesses', { token: clothingOtherLogin.json.data.token, body: { name: 'Other Clothing', industry: 'clothing', businessType: 'retail', city: 'Mumbai', country: 'India', currency: 'INR' } })
  const isolatedColorUpdate = await call('PATCH', `/colors/${navy.json.data.colorId}`, { token: clothingOtherBiz.json.data.token, body: { name: 'Stolen' } })
  check('color businessId isolation', isolatedColorUpdate.status === 404)

  await call('POST', '/users', { token: clothingToken, body: { name: 'Color Viewer', email: 'color.viewer@test.com', role: 'Staff' } })
  const colorViewer = await call('POST', '/auth/register', { body: { email: 'color.viewer@test.com', password: 'Str0ng-Test-Pass!9', role: 'team' } })
  const viewerList = await call('GET', '/colors', { token: colorViewer.json.data.token })
  const viewerWrite = await call('POST', '/colors', { token: colorViewer.json.data.token, body: { name: 'Red', hexCode: '#FF0000' } })
  check('authorized role can view color master', viewerList.status === 200)
  check('role without edit_product cannot modify colors', viewerWrite.status === 403)

  const colorModuleDenied = await call('GET', '/colors', { token: otherToken })
  check('color API requires enabled clothing module', colorModuleDenied.status === 403)

  // ---- reusable Clothing provisioning, variants, replenishment, masters and security ----
  const clothingModules = clothingBiz.json.data.business.capabilities.modules
  check('new Clothing Retail business auto-provisions advanced modules', ['variantGrid', 'replenishment', 'promotions', 'loyalty', 'coupons', 'giftCards', 'cashierShifts', 'clothingReports'].every((name) => clothingModules.includes(name)), JSON.stringify(clothingModules))
  await call('POST', '/auth/register', { body: { email: 'new.wholesale.clothing@test.com', password: 'Str0ng-Test-Pass!9' } })
  const newWholesaleLogin = await call('POST', '/auth/login', { body: { email: 'new.wholesale.clothing@test.com', password: 'Str0ng-Test-Pass!9' } })
  const newWholesale = await call('POST', '/businesses', { token: newWholesaleLogin.json.data.token, body: { name: 'New Wholesale Fashion', industry: 'Clothing', businessType: 'Wholesale', city: 'Jaipur', country: 'India', currency: 'INR' } })
  const newWholesaleToken = newWholesale.json.data.token
  check('new Clothing Wholesale business receives clothing and wholesale capabilities', newWholesale.status === 201 && newWholesale.json.data.business.capabilities.modules.includes('variantGrid') && newWholesale.json.data.business.capabilities.modules.includes('bulkPricing'))
  check('new Clothing business starts with isolated empty product data', (await call('GET', '/products', { token: newWholesaleToken })).json.data.length === 0)
  check('non-Clothing business cannot access advanced Clothing APIs', (await call('GET', '/clothing/variants', { token: otherToken })).status === 403)

  const clothingSupplier = await call('POST', '/suppliers', { token: clothingToken, body: { supplierName: 'Cloth Source', contactPerson: 'Mira', phone: '9999999999', email: 'cloth@source.test', city: 'Delhi', state: 'Delhi', country: 'India' } })
  const variantSave = await call('PUT', `/clothing/products/${legacyProduct.json.data.productId}/variants`, { token: clothingToken, body: { variants: [{ size: 'M', color: 'Jet Black', sku: 'LEG-BLK-M', barcode: '8901000000001', currentStock: 10, reorderPoint: 12, targetStock: 30, preferredSupplierId: clothingSupplier.json.data.supplierId, replenishmentEnabled: true }] } })
  check('size x color variant creation with SKU and barcode', variantSave.status === 200 && variantSave.json.data.variants[0].sku === 'LEG-BLK-M', JSON.stringify(variantSave.json))
  const variantId = String(variantSave.json.data.variants[0]._id)
  const variantList = await call('GET', '/clothing/variants?search=8901000000001&size=M&color=Jet%20Black&stock=low', { token: clothingToken })
  check('variant search and filters', variantList.status === 200 && variantList.json.data.length === 1)
  check('limited Clothing team member inherits module and view permission', (await call('GET', '/clothing/variants', { token: colorViewer.json.data.token })).status === 200)
  check('limited Clothing team member cannot manage variants', (await call('PUT', `/clothing/products/${legacyProduct.json.data.productId}/variants`, { token: colorViewer.json.data.token, body: { variants: [{ size: 'XL', color: 'Jet Black', sku: 'DENIED-XL' }] } })).status === 403)
  check('variant barcode resolves exact combination', (await call('GET', '/clothing/barcode/8901000000001', { token: clothingToken })).json.data.variant.sku === 'LEG-BLK-M')
  check('variant barcode is tenant isolated', (await call('GET', '/clothing/barcode/8901000000001', { token: newWholesaleToken })).status === 404)
  const variantStock = await call('POST', `/clothing/products/${legacyProduct.json.data.productId}/variants/${variantId}/stock`, { token: clothingToken, body: { type: 'stock_in', quantity: 2, reason: 'Variant receipt test' } })
  check('variant stock operation creates variant stock history', variantStock.status === 201 && variantStock.json.data.variant.currentStock === 12 && variantStock.json.data.transaction.variantSku === 'LEG-BLK-M')
  const suggestions = await call('GET', '/clothing/replenishment', { token: clothingToken })
  check('replenishment calculates target minus current', suggestions.status === 200 && suggestions.json.data.some((x) => x.variantId === variantId && x.suggestedQuantity === 18))
  const draftVariantPo = await call('POST', '/clothing/replenishment/purchase-order', { token: clothingToken, body: { variantIds: [variantId] } })
  check('replenishment creates Draft purchase order', draftVariantPo.status === 201 && draftVariantPo.json.data.status === 'Draft' && draftVariantPo.json.data.items[0].variantSku === 'LEG-BLK-M')
  const coveredByDraft = await call('GET', '/clothing/replenishment', { token: clothingToken })
  check('open Draft PO prevents duplicate replenishment quantity', !coveredByDraft.json.data.some((x) => x.variantId === variantId))
  check('view-only replenishment role cannot create purchase orders', (await call('POST', '/clothing/replenishment/purchase-order', { token: colorViewer.json.data.token, body: { variantIds: [variantId] } })).status === 403)
  await call('PATCH', `/purchase-orders/${draftVariantPo.json.data.purchaseOrderId}/status`, { token: clothingToken, body: { status: 'Ordered' } })
  const partialVariantReceiving = await call('POST', '/receiving', { token: clothingToken, body: { purchaseOrderId: draftVariantPo.json.data.purchaseOrderId, items: [{ productId: legacyProduct.json.data.productId, variantId, receivedQuantity: 10, damagedQuantity: 0, rejectedQuantity: 0 }] } })
  const partialOrder = await call('GET', `/purchase-orders/${draftVariantPo.json.data.purchaseOrderId}`, { token: clothingToken })
  const afterPartialVariant = (await call('GET', '/clothing/variants?search=LEG-BLK-M', { token: clothingToken })).json.data[0]
  const coveredByRemainingIncoming = await call('GET', '/clothing/replenishment', { token: clothingToken })
  check('partial receiving updates stock and PO status', partialVariantReceiving.status === 201 && partialOrder.json.data.status === 'Partially Received' && afterPartialVariant.currentStock === 22)
  check('remaining incoming quantity prevents duplicate shortage', !coveredByRemainingIncoming.json.data.some((x) => x.variantId === variantId))
  const variantReceiving = await call('POST', '/receiving', { token: clothingToken, body: { purchaseOrderId: draftVariantPo.json.data.purchaseOrderId, items: [{ productId: legacyProduct.json.data.productId, variantId, receivedQuantity: 8, damagedQuantity: 0, rejectedQuantity: 0 }] } })
  const afterVariantReceiving = (await call('GET', '/clothing/variants?search=LEG-BLK-M', { token: clothingToken })).json.data[0]
  const completedOrder = await call('GET', `/purchase-orders/${draftVariantPo.json.data.purchaseOrderId}`, { token: clothingToken })
  check('purchase receiving updates exact ordered variant', variantReceiving.status === 201 && afterVariantReceiving.currentStock === 30 && completedOrder.json.data.status === 'Received')

  const clothingPromo = await call('POST', '/clothing/promotions', { token: clothingToken, body: { name: 'Winter Shirts', type: 'percentage', discountValue: 20, active: true } })
  const clothingCoupon = await call('POST', '/clothing/coupons', { token: clothingToken, body: { code: 'FASHION10', discountType: 'percentage', discountValue: 10, minimumOrderValue: 100, maximumDiscount: 500, totalUsageLimit: 2, perCustomerUsageLimit: 1, active: true } })
  const clothingGift = await call('POST', '/clothing/giftCards', { token: clothingToken, body: { code: 'GC-CLOTH-1', initialValue: 2000, active: true } })
  check('promotion, coupon and gift-card masters persist real business data', clothingPromo.status === 201 && clothingCoupon.status === 201 && clothingGift.status === 201 && clothingGift.json.data.currentBalance === 2000)
  check('commercial masters are tenant isolated', (await call('GET', '/clothing/giftCards?search=GC-CLOTH-1', { token: newWholesaleToken })).json.data.length === 0)
  const clothingBuyer = await call('POST', '/customers', { token: clothingToken, body: { name: 'Clothing Buyer', phone: '9888888888', email: 'buyer@cloth.test', customerType: 'retail' } })
  const variantSale = await call('POST', '/pos/checkout', { token: clothingToken, body: { customerId: clothingBuyer.json.data.customerId, items: [{ productId: legacyProduct.json.data.productId, variantId, quantity: 1, unitPrice: 500 }], couponCode: 'FASHION10', payments: [{ method: 'Gift Card', amount: 368, reference: 'GC-CLOTH-1' }] } })
  check('POS sells exact variant with backend promotion/coupon/gift-card pricing', variantSale.status === 201 && variantSale.json.data.invoice.items[0].variantSku === 'LEG-BLK-M' && variantSale.json.data.invoice.totalAmount === 368, JSON.stringify(variantSale.json))
  const afterGift = (await call('GET', '/clothing/giftCards?search=GC-CLOTH-1', { token: clothingToken })).json.data[0]
  check('gift-card redemption is atomic and auditable', afterGift.currentBalance === 1632 && afterGift.transactions.length === 2)
  const sellableVariantReturn = await call('POST', '/returns', { token: clothingToken, body: { type: 'sale', orderId: variantSale.json.data.invoice.orderId, productId: legacyProduct.json.data.productId, variantId, quantity: 1, reason: 'Size/Fit issue', condition: 'Sellable', idempotencyKey: 'variant-sellable-return' } })
  const afterVariantReturn = (await call('GET', '/clothing/variants?search=LEG-BLK-M', { token: clothingToken })).json.data[0]
  check('sellable return restores only original variant stock', sellableVariantReturn.status === 201 && sellableVariantReturn.json.data.variantSku === 'LEG-BLK-M' && afterVariantReturn.currentStock === 30)
  const unpaidVariantSale = await call('POST', '/pos/checkout', { token: clothingToken, body: { customerId: clothingBuyer.json.data.customerId, items: [{ productId: legacyProduct.json.data.productId, variantId, quantity: 1, unitPrice: 500 }], payments: [] } })
  const damagedVariantReturn = await call('POST', '/returns', { token: clothingToken, body: { type: 'sale', orderId: unpaidVariantSale.json.data.invoice.orderId, productId: legacyProduct.json.data.productId, variantId, quantity: 1, reason: 'Damaged product', condition: 'Damaged', idempotencyKey: 'variant-damaged-return' } })
  const afterDamagedVariant = (await call('GET', '/clothing/variants?search=LEG-BLK-M', { token: clothingToken })).json.data[0]
  check('damaged return stays in variant non-sellable stock', damagedVariantReturn.status === 201 && afterDamagedVariant.currentStock === 29 && afterDamagedVariant.nonSellableStock.damaged === 1)
  await call('POST', `/clothing/loyalty/${clothingBuyer.json.data.customerId}`, { token: clothingToken, body: { type: 'Earn', points: 25 } })
  const loyaltyRedeem = await call('POST', `/clothing/loyalty/${clothingBuyer.json.data.customerId}`, { token: clothingToken, body: { type: 'Redeem', points: 10 } })
  check('loyalty earn/redeem updates auditable balance', loyaltyRedeem.status === 201 && loyaltyRedeem.json.data.balanceAfter === 18)
  check('loyalty prevents negative balance', (await call('POST', `/clothing/loyalty/${clothingBuyer.json.data.customerId}`, { token: clothingToken, body: { type: 'Redeem', points: 99 } })).status === 400)
  const clothingShift = await call('POST', '/clothing/shifts', { token: clothingToken, body: { openingCash: 5000 } })
  const clothingShiftClosed = await call('PATCH', `/clothing/shifts/${clothingShift.json.data.shiftId}/close`, { token: clothingToken, body: { actualClosingCash: 4900 } })
  check('cashier shift calculates closing difference', clothingShift.status === 201 && clothingShiftClosed.status === 200 && clothingShiftClosed.json.data.difference === -100)
  const advancedReport = await call('GET', '/clothing/reports', { token: clothingToken })
  check('Clothing reports aggregate real variant and liability data', advancedReport.status === 200 && advancedReport.json.data.totalVariants === 1 && advancedReport.json.data.activePromotions === 1 && advancedReport.json.data.giftCardLiability === 1632)
  const replenishmentProduct = await call('POST', '/products', { token: clothingToken, body: { name: 'Premium Cotton Shirt', sku: 'PCS-STYLE', category: 'Shirts', purchasePrice: 300, sellingPrice: 700, currentStock: 0 } })
  const replenishmentVariantSave = await call('PUT', `/clothing/products/${replenishmentProduct.json.data.productId}/variants`, { token: clothingToken, body: { variants: [{ size: 'M', color: 'Black', sku: 'PCS-BLK-M', currentStock: 5, reorderPoint: 10, targetStock: 30, preferredSupplierId: clothingSupplier.json.data.supplierId, replenishmentEnabled: true }] } })
  const replenishmentVariantId = String(replenishmentVariantSave.json.data.variants[0]._id)
  const initialRequirement = await call('GET', '/clothing/replenishment?search=PCS-BLK-M', { token: clothingToken })
  check('real-world replenishment suggests target minus sellable stock', initialRequirement.json.data[0].suggestedQuantity === 25 && initialRequirement.json.data[0].currentStock === 5)
  const replenishmentPo = await call('POST', '/clothing/replenishment/purchase-order', { token: clothingToken, body: { variantIds: [replenishmentVariantId] } })
  await call('PATCH', `/purchase-orders/${replenishmentPo.json.data.purchaseOrderId}/status`, { token: clothingToken, body: { status: 'Ordered' } })
  await call('POST', '/receiving', { token: clothingToken, body: { purchaseOrderId: replenishmentPo.json.data.purchaseOrderId, items: [{ productId: replenishmentProduct.json.data.productId, variantId: replenishmentVariantId, receivedQuantity: 15 }] } })
  const midReplenishment = (await call('GET', '/clothing/variants?search=PCS-BLK-M', { token: clothingToken })).json.data[0]
  const midReplenishmentOrder = await call('GET', `/purchase-orders/${replenishmentPo.json.data.purchaseOrderId}`, { token: clothingToken })
  check('real-world partial receipt leaves ten units and synchronized stock', midReplenishment.currentStock === 20 && midReplenishmentOrder.json.data.status === 'Partially Received')
  await call('POST', '/receiving', { token: clothingToken, body: { purchaseOrderId: replenishmentPo.json.data.purchaseOrderId, items: [{ productId: replenishmentProduct.json.data.productId, variantId: replenishmentVariantId, receivedQuantity: 10 }] } })
  const replenishedVariant = (await call('GET', '/clothing/variants?search=PCS-BLK-M', { token: clothingToken })).json.data[0]
  check('real-world final receipt reaches target and clears requirement', replenishedVariant.currentStock === 30 && !(await call('GET', '/clothing/replenishment?search=PCS-BLK-M', { token: clothingToken })).json.data.length)
  const replenishmentSale = await call('POST', '/pos/checkout', { token: clothingToken, body: { customerId: clothingBuyer.json.data.customerId, items: [{ productId: replenishmentProduct.json.data.productId, variantId: replenishmentVariantId, quantity: 23, unitPrice: 700 }], payments: [] } })
  const requirementAfterSale = await call('GET', '/clothing/replenishment?search=PCS-BLK-M', { token: clothingToken })
  check('POS sale recalculates replenishment requirement', replenishmentSale.status === 201 && requirementAfterSale.json.data[0].currentStock === 7 && requirementAfterSale.json.data[0].suggestedQuantity === 23)
  const variantCsv = 'Product Name,Parent SKU,SKU,Barcode,Category,Size,Color,Quantity,Purchase Price,Selling Price,Minimum Stock,Reorder Point,Target Stock\nImported Tee,TEE-STYLE,TEE-BLK-M,990000000001,Tees,M,Black,8,200,450,2,4,12\nImported Tee,TEE-STYLE,TEE-WHT-L,990000000002,Tees,L,White,6,200,450,2,4,12\n'
  const variantPreview = await callForm('/product-imports/extract', clothingToken, 'clothing-variants.csv', variantCsv)
  const variantImport = await call('POST', '/product-imports/confirm', { token: clothingToken, body: { fileName: variantPreview.json.data.fileName, fileType: 'csv', variantMode: true, rows: variantPreview.json.data.rows } })
  const importedVariantRows = await call('GET', '/clothing/variants?search=Imported%20Tee', { token: clothingToken })
  check('Bulk Import groups size-color rows under one parent product', variantImport.status === 201 && variantImport.json.data.counts.created === 2 && importedVariantRows.json.data.length === 2 && new Set(importedVariantRows.json.data.map((row) => row.productId)).size === 1)
  const styleHub = await call('POST', '/suppliers', { token: clothingToken, body: { supplierName: 'StyleHub Suppliers', phone: '9888888888' } })
  const otherStyleHub = await call('POST', '/suppliers', { token: newWholesaleToken, body: { supplierName: 'StyleHub Suppliers', phone: '9777777777' } })
  const supplierVariantCsv = 'Product Name,Parent SKU,SKU,Category,Size,Color,Quantity,Purchase Price,Selling Price,Supplier,Reorder Point,Target Stock\nSupplier Shirt,SUP-STYLE,SUP-BLK-M,Shirts,M,Black,2,200,450,StyleHub Suppliers,5,12\nSupplier Shirt,SUP-STYLE,SUP-BLK-L,Shirts,L,Black,2,200,450,  stylehub   suppliers  ,5,12\nSupplier Shirt,SUP-STYLE,SUP-WHT-M,Shirts,M,White,2,200,450,Metro Garments,5,12\n'
  const supplierVariantPreview = await callForm('/product-imports/extract', clothingToken, 'supplier-variants.csv', supplierVariantCsv)
  const supplierVariantImport = await call('POST', '/product-imports/confirm', { token: clothingToken, body: { fileName: 'supplier-variants.csv', fileType: 'csv', variantMode: true, rows: supplierVariantPreview.json.data.rows } })
  const supplierVariants = await call('GET', '/clothing/variants?search=Supplier%20Shirt', { token: clothingToken })
  const clothingSuppliers = await call('GET', '/suppliers?status=all', { token: clothingToken })
  const metro = clothingSuppliers.json.data.find((item) => item.supplierName === 'Metro Garments')
  const importedStyleVariants = supplierVariants.json.data.filter((item) => item.sku.startsWith('SUP-BLK'))
  const importedMetroVariant = supplierVariants.json.data.find((item) => item.sku === 'SUP-WHT-M')
  check('row supplier import supports multiple suppliers and variant-level links', supplierVariantImport.status === 201 && importedStyleVariants.every((item) => item.preferredSupplierId === styleHub.json.data.supplierId) && importedMetroVariant.preferredSupplierId === metro.supplierId)
  check('row supplier matching ignores capitalization and repeated whitespace', clothingSuppliers.json.data.filter((item) => item.supplierName.toLowerCase().replace(/\s+/g, ' ') === 'stylehub suppliers').length === 1)
  check('missing row supplier is auto-created once', clothingSuppliers.json.data.filter((item) => item.supplierName === 'Metro Garments').length === 1)
  check('same supplier name remains isolated across businesses', otherStyleHub.status === 201 && otherStyleHub.json.data.supplierId !== styleHub.json.data.supplierId)
  const importedSuggestions = await call('GET', '/clothing/replenishment', { token: clothingToken })
  const metroSuggestion = importedSuggestions.json.data.find((item) => item.variantId === importedMetroVariant.variantId)
  check('replenishment uses imported variant preferred supplier', metroSuggestion?.preferredSupplierId === metro.supplierId && metroSuggestion?.preferredSupplier === 'Metro Garments')
  const importedDraftPo = await call('POST', '/clothing/replenishment/purchase-order', { token: clothingToken, body: { variantIds: [importedMetroVariant.variantId] } })
  check('purchase order preserves imported supplier relationship', importedDraftPo.status === 201 && importedDraftPo.json.data.supplierId === metro.supplierId)
  await call('PATCH', `/purchase-orders/${importedDraftPo.json.data.purchaseOrderId}/status`, { token: clothingToken, body: { status: 'Ordered' } })
  const importedReceiving = await call('POST', '/receiving', { token: clothingToken, body: { purchaseOrderId: importedDraftPo.json.data.purchaseOrderId, items: [{ productId: importedMetroVariant.productId, variantId: importedMetroVariant.variantId, receivedQuantity: metroSuggestion.suggestedQuantity }] } })
  check('receiving preserves supplier selected from imported variant', importedReceiving.status === 201 && importedReceiving.json.data.supplierId === metro.supplierId)
  const selectedSupplierCsv = 'Product Name,Parent SKU,SKU,Category,Size,Color,Quantity,Purchase Price,Selling Price,Supplier\nSelected Supplier Tee,SELECT-STYLE,SELECT-M,Tees,M,Green,1,100,250,Metro Garments\n'
  const selectedSupplierPreview = await callForm('/product-imports/extract', clothingToken, 'selected-supplier.csv', selectedSupplierCsv)
  await call('POST', '/product-imports/confirm', { token: clothingToken, body: { fileName: 'selected-supplier.csv', fileType: 'csv', variantMode: true, supplierId: clothingSupplier.json.data.supplierId, rows: selectedSupplierPreview.json.data.rows } })
  const selectedSupplierVariant = await call('GET', '/clothing/variants?search=SELECT-M', { token: clothingToken })
  check('select one supplier for all rows overrides row supplier separately', selectedSupplierVariant.json.data[0].preferredSupplierId === clothingSupplier.json.data.supplierId)
  const rejectedVariantMode = await call('POST', '/product-imports/confirm', { token: otherToken, body: { fileName: 'not-clothing.csv', fileType: 'csv', variantMode: true, rows: variantPreview.json.data.rows } })
  check('variant import mode is unavailable to non-Clothing businesses', rejectedVariantMode.status === 403)

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
  check('normal imported product retains supplierId relationship', bulkProduct.json.data.find((item) => item.sku === 'BULK-1')?.supplierId === supplierId)
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
  const billsBefore = await call('GET', '/pos/invoices', { token })
  const rejectedBill = await call('POST', '/pos/checkout', { token, body: { customerId, items: [{ productId, quantity: 1, unitPrice: 50 }], payments: [{ method: 'Cash', amount: 999 }] } })
  const billsAfter = await call('GET', '/pos/invoices', { token })
  check('rejected payment does not generate a bill', rejectedBill.status === 400 && billsAfter.json.data.length === billsBefore.json.data.length)

  const { notificationEvents } = await import('../services/notificationEvents.js')
  const originalSalesStatus = notificationEvents.salesStatus
  let notificationAttempted = false
  let pos
  try {
    notificationEvents.salesStatus = async () => { notificationAttempted = true; throw new Error('Simulated notification outage') }
    pos = await call('POST', '/pos/checkout', { token, body: {
      billingType: 'retail', customerId,
      items: [{ productId, quantity: 2, unitPrice: 50, discount: 0 }],
      discount: { type: 'fixed', value: 0 },
      payments: [{ method: 'Cash', amount: 50 }, { method: 'UPI', amount: 55, reference: 'UTR-TEST' }],
    } })
  } finally {
    notificationEvents.salesStatus = originalSalesStatus
  }
  check('committed bill is returned even when notification delivery fails', notificationAttempted && pos.status === 201 && !!pos.json.data?.invoice?.invoiceNumber)
  check('POS checkout 201', pos.status === 201, JSON.stringify(pos.json))
  check('POS GST and total calculated on backend', pos.json.data.invoice.tax === 5 && pos.json.data.invoice.totalAmount === 105, JSON.stringify(pos.json.data?.invoice))
  check('POS split payment marked paid', pos.json.data.invoice.amountPaid === 105 && pos.json.data.invoice.paymentStatus === 'Paid')
  const invoiceId = pos.json.data.invoice.orderId
  p = await call('GET', `/products/${productId}`, { token })
  check('POS reduced inventory 12 -> 10', p.json.data.currentStock === 10, `got ${p.json.data.currentStock}`)
  const invoice = await call('GET', `/pos/invoices/${invoiceId}`, { token })
  check('POS invoice can be reprinted', invoice.status === 200 && invoice.json.data.invoiceNumber === pos.json.data.invoice.invoiceNumber)
  check('reopened bill preserves customer, business and line details', invoice.json.data.business.businessId === businessId && invoice.json.data.customerSnapshot.name === pos.json.data.invoice.customerSnapshot.name && JSON.stringify(invoice.json.data.items) === JSON.stringify(pos.json.data.invoice.items))
  check('reopened bill preserves confirmed totals and payment references', invoice.json.data.amountPaid === 105 && invoice.json.data.balanceDue === 0 && invoice.json.data.paymentStatus === 'Paid' && invoice.json.data.paymentSummary.some((entry) => entry.method === 'UPI' && entry.reference === 'UTR-TEST' && entry.amount === 55))
  const otherInvoice = await call('GET', `/pos/invoices/${invoiceId}`, { token: otherToken })
  check('POS invoice business isolation', otherInvoice.status === 404)

  // ---- POS payment offers: "Any"/blank method applies on any tender (incl. gift card); a bound method still gates ----
  await call('PATCH', '/businesses/me', { token, body: { settings: { paymentOffers: [{ code: 'ANY5', label: 'Flat 5% off', paymentMethod: 'Any', discountType: 'percent', value: 5, minimumAmount: 0, maximumDiscount: 0, active: true }] } } })
  const anyOfferSale = await call('POST', '/pos/checkout', { token, body: { customerId, items: [{ productId, quantity: 1, unitPrice: 100 }], offerCode: 'ANY5', payments: [{ method: 'Cash', amount: 100 }] } })
  check('payment offer with "Any" method applies regardless of tender', anyOfferSale.status === 201 && anyOfferSale.json.data.invoice.offerDiscount === 5, JSON.stringify(anyOfferSale.json.data?.invoice))
  await call('PATCH', '/businesses/me', { token, body: { settings: { paymentOffers: [{ code: 'UPIONLY', label: 'UPI only', paymentMethod: 'UPI', discountType: 'percent', value: 10, minimumAmount: 0, maximumDiscount: 0, active: true }] } } })
  const mismatchOfferSale = await call('POST', '/pos/checkout', { token, body: { customerId, items: [{ productId, quantity: 1, unitPrice: 100 }], offerCode: 'UPIONLY', payments: [{ method: 'Cash', amount: 100 }] } })
  check('payment offer bound to a method is skipped when that method is not tendered', mismatchOfferSale.status === 201 && mismatchOfferSale.json.data.invoice.offerDiscount === 0)
  await call('PATCH', '/businesses/me', { token, body: { settings: { paymentOffers: [] } } })
  const creditPos = await call('POST', '/pos/checkout', { token, body: { billingType: 'wholesale', customerId, items: [{ productId, quantity: 1, unitPrice: 50 }], payments: [{ method: 'Cash', amount: 20 }, { method: 'Pay Later', amount: 33 }] } })
  check('POS wholesale partial payment', creditPos.status === 201 && creditPos.json.data.invoice.paymentStatus === 'Partially Paid' && creditPos.json.data.invoice.balanceDue === 33, JSON.stringify(creditPos.json))
  const creditInvoiceId = creditPos.json.data.invoice.orderId
  const settleCredit = await call('POST', '/payments', { token, body: { type: 'sale', referenceId: creditInvoiceId, amount: 33, paymentMethod: 'UPI', reference: 'SETTLE-1' } })
  const settledInvoice = await call('GET', `/pos/invoices/${creditInvoiceId}`, { token })
  check('later payment settles POS outstanding', settleCredit.status === 201 && settledInvoice.json.data.balanceDue === 0 && settledInvoice.json.data.paymentStatus === 'Paid')

  // ---- complete sales return + refund management ----
  const returnProductResponse = await call('POST', '/products', { token, body: { name: 'Return Test Shirt', sku: 'RET-SHIRT-1', category: 'Clothing', sellingPrice: 100, purchasePrice: 40, currentStock: 200, minimumStock: 5 } })
  const returnProductId = returnProductResponse.json.data.productId
  const posSale = (quantity, payments) => call('POST', '/pos/checkout', { token, body: { customerId, items: [{ productId: returnProductId, quantity, unitPrice: 100 }], payments } })
  const makeReturn = (orderId, quantity, condition = 'Sellable', idempotencyKey = `return-${orderId}-${quantity}-${condition}`) => call('POST', '/returns', { token, body: { type: 'sale', orderId, productId: returnProductId, quantity, reason: condition === 'Defective' ? 'Defective product' : 'Customer changed mind', condition, idempotencyKey } })

  const fullyPaidSale = await posSale(2, [{ method: 'Cash', amount: 210 }])
  const fullyPaidReturn = await makeReturn(fullyPaidSale.json.data.invoice.orderId, 1, 'Sellable', 'fully-paid-return')
  check('fully paid return calculates from original line', fullyPaidReturn.status === 201 && fullyPaidReturn.json.data.returnValue === 105 && fullyPaidReturn.json.data.refundRequired === 105)
  const duplicateReturn = await makeReturn(fullyPaidSale.json.data.invoice.orderId, 1, 'Sellable', 'fully-paid-return')
  const stockAfterIdempotentReturn = await call('GET', `/products/${returnProductId}`, { token })
  check('duplicate submission is idempotent', duplicateReturn.json.data.returnId === fullyPaidReturn.json.data.returnId && stockAfterIdempotentReturn.json.data.currentStock === 199)
  const fullRefund = await call('POST', `/returns/${fullyPaidReturn.json.data.returnId}/refunds`, { token, body: { amount: 105, method: 'Original Payment Method', status: 'Refunded' } })
  check('fully paid order supports original-method refund', fullRefund.status === 201 && fullRefund.json.data.return.refundStatus === 'Refunded' && fullRefund.json.data.refund.resolvedMethod === 'Cash')

  const partialReturn = await makeReturn(fullyPaidSale.json.data.invoice.orderId, 1, 'Sellable', 'partial-refund-return')
  const partialRefund = await call('POST', `/returns/${partialReturn.json.data.returnId}/refunds`, { token, body: { amount: 60, method: 'Cash', status: 'Refunded' } })
  check('partial refund remains traceable', partialRefund.status === 201 && partialRefund.json.data.return.refundStatus === 'Partially Refunded' && partialRefund.json.data.return.remainingRefund === 45)
  const overRefund = await call('POST', `/returns/${partialReturn.json.data.returnId}/refunds`, { token, body: { amount: 50, method: 'Cash', status: 'Refunded' } })
  check('over-refund prevented', overRefund.status === 400)
  const finishPartialRefund = await call('POST', `/returns/${partialReturn.json.data.returnId}/refunds`, { token, body: { amount: 45, method: 'Card', status: 'Refunded' } })
  check('multiple partial refunds settle return', finishPartialRefund.status === 201 && finishPartialRefund.json.data.return.refundStatus === 'Refunded')

  const partialPaidSale = await posSale(5, [{ method: 'Cash', amount: 300 }])
  const partialPaidReturn = await makeReturn(partialPaidSale.json.data.invoice.orderId, 1, 'Sellable', 'partial-paid-return')
  check('partially paid return reduces outstanding before refund', partialPaidReturn.json.data.outstandingBefore === 225 && partialPaidReturn.json.data.outstandingAdjustment === 105 && partialPaidReturn.json.data.refundRequired === 0)
  const customersAfterAdjustment = await call('GET', '/customers', { token })
  check('customer outstanding balance adjusted', customersAfterAdjustment.json.data.find((item) => item.customerId === customerId).outstandingBalance === 120)

  const greaterThanOutstandingSale = await posSale(5, [{ method: 'UPI', amount: 450 }])
  const damagedBefore = (await call('GET', `/products/${returnProductId}`, { token })).json.data
  const greaterReturn = await makeReturn(greaterThanOutstandingSale.json.data.invoice.orderId, 1, 'Damaged', 'greater-than-outstanding')
  const damagedAfter = (await call('GET', `/products/${returnProductId}`, { token })).json.data
  check('return greater than outstanding splits adjustment and refund', greaterReturn.json.data.outstandingAdjustment === 75 && greaterReturn.json.data.refundRequired === 30)
  check('damaged return does not increase sellable stock', damagedAfter.currentStock === damagedBefore.currentStock && damagedAfter.nonSellableStock.damaged === 1)
  const returnTransactions = await call('GET', '/inventory/transactions', { token })
  check('non-sellable return creates stock history', returnTransactions.json.data.some((item) => item.referenceId === greaterReturn.json.data.returnId && item.type === 'non_sellable_return' && item.stockBucket === 'damaged'))

  const unpaidSale = await posSale(2, [])
  const unpaidReturn = await makeReturn(unpaidSale.json.data.invoice.orderId, 1, 'Defective', 'unpaid-return')
  check('unpaid return never creates cash refund', unpaidReturn.json.data.outstandingAdjustment === 105 && unpaidReturn.json.data.refundRequired === 0 && unpaidReturn.json.data.refundStatus === 'Not Required')
  const defectiveProduct = (await call('GET', `/products/${returnProductId}`, { token })).json.data
  check('defective return tracked separately', defectiveProduct.nonSellableStock.defective === 1)

  const splitPaidSale = await posSale(1, [{ method: 'Cash', amount: 50 }, { method: 'UPI', amount: 55 }])
  const splitReturn = await makeReturn(splitPaidSale.json.data.invoice.orderId, 1, 'Opened / Used', 'store-credit-return')
  const storeCreditRefund = await call('POST', `/returns/${splitReturn.json.data.returnId}/refunds`, { token, body: { amount: 105, method: 'Store Credit', status: 'Refunded' } })
  const customerWithCredit = (await call('GET', '/customers', { token })).json.data.find((item) => item.customerId === customerId)
  check('store credit refund updates customer credit balance', storeCreditRefund.status === 201 && customerWithCredit.creditBalance === 105)
  const creditPosPartial = await call('POST', '/pos/checkout', { token, body: { customerId, items: [{ productId, quantity: 1, unitPrice: 50 }], payments: [{ method: 'Store Credit', amount: 50 }] } })
  const afterPartialCredit = (await call('GET', '/customers', { token })).json.data.find((item) => item.customerId === customerId)
  check('POS supports partial existing store-credit usage', creditPosPartial.status === 201 && afterPartialCredit.creditBalance === 55)
  const creditPosFull = await call('POST', '/pos/checkout', { token, body: { customerId, items: [{ productId, quantity: 1, unitPrice: 50 }], payments: [{ method: 'Store Credit', amount: 55 }] } })
  check('POS prevents store credit above bill total', creditPosFull.status === 400)
  const consumeCredit = await call('POST', '/pos/checkout', { token, body: { customerId, items: [{ productId, quantity: 2, unitPrice: 50 }], payments: [{ method: 'Store Credit', amount: 55 }, { method: 'Cash', amount: 50 }] } })
  const afterFullCredit = (await call('GET', '/customers', { token })).json.data.find((item) => item.customerId === customerId)
  check('POS supports full store-credit balance plus split payment', consumeCredit.status === 201 && afterFullCredit.creditBalance === 0)

  const pendingSale = await posSale(1, [{ method: 'Card', amount: 105 }])
  const refundPendingReturn = await makeReturn(pendingSale.json.data.invoice.orderId, 1, 'Sellable', 'pending-failed-return')
  const pendingRefund = await call('POST', `/returns/${refundPendingReturn.json.data.returnId}/refunds`, { token, body: { amount: 105, method: 'Card', status: 'Pending' } })
  check('pending refund does not financially settle return', pendingRefund.json.data.return.refundStatus === 'Pending')
  const failedRefund = await call('PATCH', `/returns/${refundPendingReturn.json.data.returnId}/refunds/${pendingRefund.json.data.refund.refundId}`, { token, body: { status: 'Failed' } })
  check('failed refund remains actionable', failedRefund.json.data.return.refundStatus === 'Failed')
  const retryRefund = await call('POST', `/returns/${refundPendingReturn.json.data.returnId}/refunds`, { token, body: { amount: 105, method: 'Card', status: 'Refunded' } })
  check('failed refund can be retried successfully', retryRefund.status === 201 && retryRefund.json.data.return.refundStatus === 'Refunded')

  const splitMethodSale = await posSale(1, [{ method: 'Cash', amount: 50 }, { method: 'UPI', amount: 55 }])
  const splitMethodReturn = await makeReturn(splitMethodSale.json.data.invoice.orderId, 1, 'Sellable', 'split-method-return')
  const splitMethodRefund = await call('POST', `/returns/${splitMethodReturn.json.data.returnId}/refunds`, { token, body: { amount: 105, method: 'Original Payment Method', status: 'Refunded' } })
  check('original method handles split payments', splitMethodRefund.json.data.refund.allocations.length === 2 && splitMethodRefund.json.data.refund.resolvedMethod.includes('Cash') && splitMethodRefund.json.data.refund.resolvedMethod.includes('UPI'))

  const searchedReturn = await call('GET', `/returns?type=sale&search=${encodeURIComponent('Return Test Shirt')}`, { token })
  const filteredReturn = await call('GET', '/returns?type=sale&refundStatus=Failed', { token })
  check('return history search uses product snapshot', searchedReturn.status === 200 && searchedReturn.json.data.some((item) => item.productSku === 'RET-SHIRT-1'))
  check('return history filters are business scoped', filteredReturn.status === 200 && filteredReturn.json.data.every((item) => item.refundStatus === 'Failed'))
  const isolatedReturn = await call('GET', `/returns/${fullyPaidReturn.json.data.returnId}`, { token: otherToken })
  check('return and refund business isolation', isolatedReturn.status === 404)

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
  const teamRegistration = await call('POST', '/auth/register', { body: { email: 'sales.agent@test.com', password: 'Str0ng-Test-Pass!9', role: 'team' } })
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
  const deniedRefund = await call('POST', `/returns/${greaterReturn.json.data.returnId}/refunds`, { token: teamToken, body: { amount: 30, method: 'Cash', status: 'Refunded' } })
  check('cashier/sales role cannot process refunds', deniedRefund.status === 403)
  await call('PATCH', `/users/${linked.userId}`, { token, body: { status: 'inactive' } })
  const inactiveTeam = await call('GET', '/auth/me', { token: teamToken })
  check('deactivated team account cannot continue', inactiveTeam.status === 403)

  // ---- reports ----
  const report = await call('GET', '/reports/summary', { token })
  check('report summary', report.status === 200 && report.json.data.productCount === 3 && report.json.data.salesReturnTotal > 0 && report.json.data.salesTotal < report.json.data.grossSalesTotal, JSON.stringify(report.json))

  // ---- PERSISTENCE: disconnect, reconnect, re-query (simulates backend restart) ----
  await disconnectDatabase()
  await connectDatabase()
  const afterRestart = await call('GET', '/products', { token })
  check('data persists after DB reconnect', afterRestart.status === 200 && afterRestart.json.data.some((item) => item.productId === productId) && afterRestart.json.data.some((item) => item.sku === 'BULK-1'), JSON.stringify(afterRestart.json))
  const custAfter = await call('GET', '/customers', { token })
  check('customer persists after reconnect', custAfter.json.data.some((c) => c.customerId === customerId))
  check('business isolation held (businessId stable)', afterRestart.json.data.every((x) => x.businessId === businessId), JSON.stringify(afterRestart.json.data))

  // ---- owner-only business deletion and scoped cleanup ----
  const teamDelete = await call('DELETE', '/businesses/me', { token: teamToken })
  check('team member cannot delete business', [403, 404].includes(teamDelete.status))
  const deleteBusiness = await call('DELETE', '/businesses/me', { token })
  check('owner can delete business', deleteBusiness.status === 200 && deleteBusiness.json.data.deleted === true, JSON.stringify(deleteBusiness.json))
  const ownerAfterDelete = await call('GET', '/auth/me', { token })
  check('deleted business is detached from owner account', ownerAfterDelete.status === 200 && ownerAfterDelete.json.data.business === null, JSON.stringify(ownerAfterDelete.json))
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
