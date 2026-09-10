const coreProductFields = [
  'name', 'sku', 'category', 'purchasePrice', 'sellingPrice', 'currentStock',
  'minimumStock', 'supplier', 'description', 'hsnCode', 'gstRate',
]

const coreModules = [
  'dashboard', 'products', 'inventory', 'purchases', 'sales', 'suppliers',
  'customers', 'payments', 'reports', 'team', 'settings',
]

export const industryConfig = {
  other: {
    modules: [...coreModules],
    features: ['lowStock'],
    dashboardWidgets: ['inventoryValue', 'itemsInStock', 'lowStock'],
    productFields: [...coreProductFields, 'brand', 'unit', 'barcode'],
  },
  pharmacy: {
    modules: [...coreModules, 'pos', 'batches', 'expiry', 'prescriptions'],
    features: ['batchTracking', 'expiryTracking', 'prescriptions', 'lowStock'],
    dashboardWidgets: ['todaySales', 'expiringStock', 'expiredStock', 'lowStock', 'batchAlerts'],
    productLabel: 'Medicines',
    productFields: [...coreProductFields, 'genericName', 'manufacturer', 'batchNumber', 'manufacturingDate', 'expiryDate', 'mrp', 'unit'],
  },
  clothing: {
    modules: [...coreModules, 'pos', 'categories', 'sizes', 'colors', 'variants', 'variantGrid', 'replenishment', 'promotions', 'loyalty', 'coupons', 'giftCards', 'cashierShifts', 'clothingReports'],
    features: ['sizeManagement', 'colorManagement', 'productVariants', 'variantInventory', 'barcodeVariants', 'replenishment', 'promotions', 'loyalty', 'coupons', 'giftCards', 'storeCreditAtPos', 'cashierShifts', 'lowStock'],
    dashboardWidgets: ['sales', 'inventoryValue', 'totalVariants', 'lowStockVariants', 'reorderSuggestions'],
    productFields: [...coreProductFields, 'brand', 'size', 'color', 'unit', 'barcode'],
  },
  electronics: {
    modules: [...coreModules, 'pos', 'categories', 'serialNumbers', 'warranties'],
    features: ['serialTracking', 'imeiTracking', 'warrantyTracking', 'lowStock'],
    dashboardWidgets: ['sales', 'inventoryValue', 'lowStock', 'warrantyAlerts'],
    productFields: [...coreProductFields, 'brand', 'model', 'serialNumber', 'imei', 'warrantyMonths', 'unit', 'barcode'],
  },
  grocery: {
    modules: [...coreModules, 'pos', 'categories', 'expiry', 'offers'],
    features: ['expiryTracking', 'fastPos', 'offers', 'lowStock', 'weightedProducts'],
    dashboardWidgets: ['todaySales', 'inventoryValue', 'lowStock', 'expiringStock', 'fastMoving'],
    productFields: [...coreProductFields, 'brand', 'barcode', 'unit', 'weight', 'expiryDate'],
  },
  hardware: {
    modules: [...coreModules, 'pos', 'categories'],
    features: ['lowStock', 'retailPricing', 'wholesalePricing', 'reorderPoint', 'unitConversion', 'rackLocation'],
    dashboardWidgets: ['todaySales', 'grossProfit', 'inventoryValue', 'itemsInStock', 'lowStock', 'outOfStock', 'pendingOrders', 'outstandingReceivables', 'purchaseDue', 'activeSuppliers', 'activeCustomers', 'wholesaleOrders'],
    productFields: [...coreProductFields, 'brand', 'model', 'size', 'dimensions', 'material', 'unit', 'barcode', 'dealerPrice', 'wholesalePrice', 'wholesaleMinQuantity', 'reorderLevel', 'warehouse', 'rackLocation', 'warrantyMonths'],
  },
  automobile: {
    modules: [...coreModules, 'pos', 'categories', 'serialNumbers', 'warranties'],
    features: ['serialTracking', 'warrantyTracking', 'lowStock'],
    dashboardWidgets: ['sales', 'inventoryValue', 'itemsInStock', 'lowStock'],
    productFields: [...coreProductFields, 'brand', 'model', 'serialNumber', 'warrantyMonths', 'unit', 'barcode'],
  },
  wholesale: {
    modules: [...coreModules, 'bulkOrders', 'bulkPricing', 'creditSales'],
    features: ['wholesalePricing', 'creditSales', 'lowStock'],
    dashboardWidgets: ['inventoryValue', 'itemsInStock', 'lowStock'],
    productFields: [...coreProductFields, 'brand', 'unit', 'barcode', 'wholesalePrice', 'wholesaleMinQuantity'],
  },
  retail: {
    modules: [...coreModules, 'pos', 'categories'],
    features: ['retailPricing', 'lowStock'],
    dashboardWidgets: ['sales', 'inventoryValue', 'itemsInStock', 'lowStock'],
    productFields: [...coreProductFields, 'brand', 'unit', 'barcode'],
  },
  restaurant: {
    modules: [...coreModules, 'pos', 'expiry'],
    features: ['expiryTracking', 'fastPos', 'lowStock'],
    dashboardWidgets: ['todaySales', 'inventoryValue', 'lowStock', 'expiringStock'],
    productFields: [...coreProductFields, 'brand', 'unit', 'weight', 'expiryDate'],
  },
  manufacturing: {
    modules: [...coreModules, 'rawMaterials', 'billOfMaterials', 'production', 'finishedGoods', 'productionTracking'],
    features: ['manufacturing', 'lowStock'],
    dashboardWidgets: ['inventoryValue', 'rawMaterialStock', 'productionStatus', 'finishedGoods'],
    productFields: [...coreProductFields, 'brand', 'model', 'unit', 'barcode'],
  },
}

export const businessTypeConfig = {
  retail: { modules: ['pos'], features: ['retailPricing'] },
  wholesale: { modules: ['bulkOrders', 'bulkPricing', 'creditSales', 'payments'], features: ['wholesalePricing', 'creditSales'], productFields: ['wholesalePrice', 'wholesaleMinQuantity', 'dealerPrice'] },
  retailwholesale: { modules: ['pos', 'bulkOrders', 'bulkPricing', 'creditSales', 'payments'], features: ['retailPricing', 'wholesalePricing', 'creditSales'], productFields: ['wholesalePrice', 'wholesaleMinQuantity', 'dealerPrice'] },
  manufacturing: { modules: ['rawMaterials', 'billOfMaterials', 'production', 'finishedGoods', 'productionTracking'], features: ['manufacturing'] },
  service: { modules: [], features: ['serviceBusiness'] },
  other: { modules: [], features: [] },
}

const moduleDefinitions = {
  products: { section: 'Inventory', pages: ['Products', 'Bulk Import'], label: 'Products', permission: 'view_inventory' },
  categories: { section: 'Inventory', page: 'Categories', label: 'Categories', permission: 'view_inventory' },
  inventory: { section: 'Inventory', pages: ['Stock', 'Stock In', 'Stock Out', 'Adjustments', 'Stock History'], permission: 'view_inventory' },
  purchases: { section: 'Purchases', pages: ['Purchase Orders', 'Receiving'], permission: 'view_inventory' },
  suppliers: { section: 'Purchases', page: 'Suppliers', permission: 'view_inventory' },
  sales: { section: 'Orders / Sales', pages: ['Orders', 'Returns'], permission: 'create_order' },
  pos: { section: 'Orders / Sales', page: 'POS / Billing', permission: 'process_pos_sale' },
  customers: { section: 'Orders / Sales', page: 'Customers', permission: 'create_order' },
  payments: { section: 'Orders / Sales', page: 'Payments', permission: 'view_reports' },
  reports: { section: 'Reports', page: 'Reports', permission: 'view_reports' },
  team: { section: 'Users', pages: ['Users', 'Roles', 'Permissions'], permission: 'manage_users' },
  settings: { section: 'Business', pages: ['Business Profile', 'Settings'], permission: 'manage_users' },
  batches: { section: 'Industry', page: 'Batch Management', permission: 'view_inventory' },
  expiry: { section: 'Industry', page: 'Expiry Tracking', permission: 'view_inventory' },
  prescriptions: { section: 'Industry', page: 'Prescription Management', permission: 'create_order' },
  sizes: { section: 'Industry', page: 'Size Management', permission: 'view_inventory' },
  colors: { section: 'Industry', page: 'Color Management', permission: 'view_inventory' },
  variants: { section: 'Industry', page: 'Product Variants', permission: 'view_inventory' },
  variantGrid: { section: 'Clothing', page: 'Variant Grid', permission: 'view_variants' },
  replenishment: { section: 'Clothing', page: 'Replenishment', permission: 'view_replenishment' },
  promotions: { section: 'Clothing', page: 'Promotions', permission: 'manage_promotions' },
  loyalty: { section: 'Clothing', page: 'Loyalty', permission: 'manage_loyalty' },
  coupons: { section: 'Clothing', page: 'Coupons', permission: 'manage_coupons' },
  giftCards: { section: 'Clothing', page: 'Gift Cards', permission: 'manage_gift_cards' },
  cashierShifts: { section: 'Clothing', page: 'Cashier Shifts', permission: 'manage_cashier_shift' },
  clothingReports: { section: 'Clothing', page: 'Clothing Reports', permission: 'view_clothing_reports' },
  serialNumbers: { section: 'Industry', page: 'Serial Numbers', permission: 'view_inventory' },
  warranties: { section: 'Industry', page: 'Warranty Tracking', permission: 'view_inventory' },
  offers: { section: 'Industry', page: 'Offers / Discounts', permission: 'process_pos_sale' },
  bulkOrders: { section: 'Wholesale', page: 'Bulk Orders', permission: 'create_order' },
  bulkPricing: { section: 'Wholesale', page: 'Bulk Pricing', permission: 'edit_product' },
  creditSales: { section: 'Wholesale', page: 'Credit Sales', permission: 'create_order' },
  rawMaterials: { section: 'Manufacturing', page: 'Raw Materials', permission: 'view_inventory' },
  billOfMaterials: { section: 'Manufacturing', page: 'Bill of Materials', permission: 'view_inventory' },
  production: { section: 'Manufacturing', page: 'Production', permission: 'stock_out' },
  finishedGoods: { section: 'Manufacturing', page: 'Finished Goods', permission: 'view_inventory' },
  productionTracking: { section: 'Manufacturing', page: 'Production Tracking', permission: 'view_inventory' },
}

const pagePermissions = {
  'Bulk Import': ['create_product', 'stock_in'], 'Stock In': 'stock_in', 'Stock Out': 'stock_out',
  Adjustments: 'edit_product', Receiving: 'stock_in', 'POS / Billing': 'process_pos_sale',
  'Bulk Pricing': 'edit_product', Production: 'stock_out',
}

export function normalizeConfigValue(value, fallback = 'other') {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
  return normalized || fallback
}

const unique = (items) => [...new Set(items)]

function getIndustryConfig(industry) {
  return industryConfig[normalizeConfigValue(industry)] || industryConfig.other
}

function getBusinessTypeConfig(businessType) {
  return businessTypeConfig[normalizeConfigValue(businessType)] || businessTypeConfig.other
}

export function resolveBusinessCapabilities(business = {}) {
  const industry = normalizeConfigValue(business.industry)
  const businessType = normalizeConfigValue(business.businessType)
  const industrySettings = getIndustryConfig(industry)
  const typeSettings = getBusinessTypeConfig(businessType)
  const disabled = new Set(business.settings?.disabledModules || [])
  const modules = unique([...industrySettings.modules, ...typeSettings.modules, ...(business.enabledModules || [])]).filter((module) => !disabled.has(module))
  return {
    industry, businessType, modules,
    features: unique([...industrySettings.features, ...typeSettings.features]),
    dashboardWidgets: unique(industrySettings.dashboardWidgets),
    productFields: unique([...industrySettings.productFields, ...(typeSettings.productFields || [])]),
    productLabel: industrySettings.productLabel || 'Products',
  }
}

const getAvailableModules = (business) => resolveBusinessCapabilities(business).modules
export const hasModule = (business, module) => getAvailableModules(business).includes(module)

export function getNavigation(business, can = () => true) {
  const config = resolveBusinessCapabilities(business)
  const sections = new Map()
  for (const module of config.modules) {
    const definition = moduleDefinitions[module]
    if (!definition || !can(definition.permission)) continue
    const pages = definition.pages || [definition.page]
    const permittedPages = pages.filter((page) => {
      const required = pagePermissions[page] || definition.permission
      return Array.isArray(required) ? required.every(can) : can(required)
    })
    const displayPages = permittedPages.map((page) => module === 'products' && page === 'Products' ? config.productLabel : page)
    sections.set(definition.section, [...(sections.get(definition.section) || []), ...displayPages])
  }
  return [...sections].map(([section, pages]) => [section, unique(pages)])
}
