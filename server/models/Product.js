import mongoose from 'mongoose'
import { serialize } from './plugins/serialize.js'

const productSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    category: { type: String, required: true, trim: true },
    brand: { type: String, trim: true, default: '' },
    size: { type: String, trim: true, default: '' },
    color: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    purchasePrice: { type: Number, min: 0, default: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    wholesalePrice: { type: Number, min: 0, default: 0 },
    wholesaleMinQuantity: { type: Number, min: 1, default: 10 },
    barcode: { type: String, trim: true, default: '' },
    hsnCode: { type: String, trim: true, default: '' },
    gstRate: { type: Number, min: 0, max: 100, default: 0 },
    currentStock: { type: Number, default: 0 },
    minimumStock: { type: Number, min: 0, default: 0 },
    unit: { type: String, enum: ['piece', 'kg', 'gram', 'litre', 'box'], default: 'piece' },
    supplier: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

productSchema.index({ business: 1, sku: 1 }, { unique: true })
productSchema.index({ business: 1, barcode: 1 }, { unique: true, partialFilterExpression: { barcode: { $type: 'string', $gt: '' } } })
productSchema.plugin(serialize('productId'))

export const Product = mongoose.model('Product', productSchema)
