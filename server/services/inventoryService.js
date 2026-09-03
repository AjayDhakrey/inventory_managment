import { Product } from '../models/Product.js'
import { StockTransaction } from '../models/StockTransaction.js'
import { ApiError } from '../utils/ApiError.js'
import { toObjectId, toNumber, assert } from '../validators/assert.js'

/**
 * Records a stock movement and updates the product's currentStock atomically
 * (within `session` when transactions are available). Returns the updated
 * product and the created transaction.
 */
export async function applyStockChange(
  { businessId, productId, type, quantity, reason = '', referenceId = '', createdBy = '', allowNegative = false },
  session = null,
) {
  const product = await Product.findOne({ business: toObjectId(businessId, 'business'), _id: toObjectId(productId, 'product id') }).session(session)
  if (!product) throw ApiError.notFound('Product not found.')

  const INCREASES = new Set(['stock_in', 'sales_return'])
  const DECREASES = new Set(['stock_out', 'purchase_return'])

  const previousStock = product.currentStock
  let newStock
  if (type === 'adjustment') {
    newStock = quantity
  } else if (INCREASES.has(type)) {
    newStock = previousStock + Math.abs(quantity)
  } else if (DECREASES.has(type)) {
    newStock = previousStock - Math.abs(quantity)
  } else {
    throw new ApiError(400, `Unknown stock change type: ${type}`)
  }

  assert(allowNegative || newStock >= 0, `This change would take ${product.name} stock below zero.`)

  product.currentStock = newStock
  await product.save({ session })

  const [transaction] = await StockTransaction.create(
    [
      {
        business: product.business,
        productId: product._id,
        type,
        quantity: Math.abs(quantity),
        previousStock,
        newStock,
        reason,
        referenceId: String(referenceId || ''),
        createdBy,
      },
    ],
    { session },
  )

  return { product, transaction }
}

/** Manual Stock In / Stock Out / Adjustment from the Inventory screen. */
export async function recordOperation(businessId, { section, productId, quantity, reason, createdBy }) {
  const map = { 'Stock In': 'stock_in', 'Stock Out': 'stock_out', Adjustments: 'adjustment' }
  const type = map[section]
  assert(type, 'Unknown inventory operation.')
  const qty = toNumber(quantity, 'Quantity', { min: 0, integer: true })
  assert(!(type !== 'adjustment' && qty === 0), 'Enter a quantity greater than zero.')

  const { product, transaction } = await applyStockChange({
    businessId,
    productId,
    type,
    quantity: qty,
    reason: (reason || '').trim() || section,
    createdBy,
  })
  return { product: product.toJSON(), transaction: transaction.toJSON() }
}

export async function listTransactions(businessId, query = {}) {
  const filter = { business: toObjectId(businessId, 'business') }
  if (query.type) filter.type = query.type
  if (query.productId && query.productId !== 'all') filter.productId = toObjectId(query.productId, 'product id')
  const docs = await StockTransaction.find(filter).sort('-createdAt').limit(Math.min(500, Number(query.limit) || 200))
  return docs.map((doc) => doc.toJSON())
}
