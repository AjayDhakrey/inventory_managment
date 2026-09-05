import mongoose from 'mongoose'
import { serialize } from './plugins/serialize.js'

const stockTransactionSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    variantSku: { type: String, trim: true, default: '' },
    variantSize: { type: String, trim: true, default: '' },
    variantColor: { type: String, trim: true, default: '' },
    type: {
      type: String,
      enum: ['stock_in', 'stock_out', 'adjustment', 'purchase_return', 'sales_return', 'non_sellable_return'],
      required: true,
    },
    quantity: { type: Number, required: true },
    previousStock: { type: Number, default: 0 },
    newStock: { type: Number, default: 0 },
    stockBucket: { type: String, enum: ['', 'sellable', 'damaged', 'defective', 'openedUsed', 'other'], default: '' },
    reason: { type: String, trim: true, default: '' },
    referenceId: { type: String, default: '' },
    createdBy: { type: String, default: '' },
  },
  { timestamps: true },
)

stockTransactionSchema.plugin(serialize('transactionId'))

export const StockTransaction = mongoose.model('StockTransaction', stockTransactionSchema)
