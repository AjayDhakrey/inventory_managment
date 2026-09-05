import mongoose from 'mongoose'
import { serialize } from './plugins/serialize.js'

const variantSchema = new mongoose.Schema({
  size: { type: String, trim: true, required: true }, color: { type: String, trim: true, required: true },
  sku: { type: String, trim: true, uppercase: true, required: true }, barcode: { type: String, trim: true, default: '' },
  sellingPrice: { type: Number, min: 0, default: null }, purchasePrice: { type: Number, min: 0, default: null }, currentStock: { type: Number, min: 0, default: 0 },
  nonSellableStock: { damaged: { type: Number, min: 0, default: 0 }, defective: { type: Number, min: 0, default: 0 }, openedUsed: { type: Number, min: 0, default: 0 }, other: { type: Number, min: 0, default: 0 } },
  minimumStock: { type: Number, min: 0, default: 0 }, reorderPoint: { type: Number, min: 0, default: 0 }, targetStock: { type: Number, min: 0, default: 0 }, reorderQuantity: { type: Number, min: 0, default: 0 },
  preferredSupplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null }, replenishmentEnabled: { type: Boolean, default: false }, active: { type: Boolean, default: true },
  rfidEnabled: { type: Boolean, default: false }, rfidIdentifier: { type: String, trim: true, default: '' },
}, { timestamps: true })

const productSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    category: { type: String, required: true, trim: true },
    brand: { type: String, trim: true, default: '' },
    genericName: { type: String, trim: true, default: '' },
    manufacturer: { type: String, trim: true, default: '' },
    batchNumber: { type: String, trim: true, default: '' },
    manufacturingDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    mrp: { type: Number, min: 0, default: 0 },
    model: { type: String, trim: true, default: '' },
    serialNumber: { type: String, trim: true, default: '' },
    imei: { type: String, trim: true, default: '' },
    warrantyMonths: { type: Number, min: 0, default: 0 },
    size: { type: String, trim: true, default: '' },
    dimensions: { type: String, trim: true, default: '' },
    material: { type: String, trim: true, default: '' },
    color: { type: String, trim: true, default: '' },
    weight: { type: Number, min: 0, default: 0 },
    description: { type: String, trim: true, default: '' },
    purchasePrice: { type: Number, min: 0, default: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    wholesalePrice: { type: Number, min: 0, default: 0 },
    wholesaleMinQuantity: { type: Number, min: 1, default: 10 },
    dealerPrice: { type: Number, min: 0, default: 0 },
    barcode: { type: String, trim: true, default: '' },
    hsnCode: { type: String, trim: true, default: '' },
    gstRate: { type: Number, min: 0, max: 100, default: 0 },
    currentStock: { type: Number, default: 0 },
    nonSellableStock: {
      damaged: { type: Number, min: 0, default: 0 },
      defective: { type: Number, min: 0, default: 0 },
      openedUsed: { type: Number, min: 0, default: 0 },
      other: { type: Number, min: 0, default: 0 },
    },
    minimumStock: { type: Number, min: 0, default: 0 },
    reorderLevel: { type: Number, min: 0, default: 0 },
    warehouse: { type: String, trim: true, default: '' },
    rackLocation: { type: String, trim: true, default: '' },
    conversionFactor: { type: Number, min: 1, default: 1 },
    purchaseUnit: { type: String, trim: true, default: '' },
    unit: {
      type: String,
      enum: ['piece', 'box', 'packet', 'kg', 'gram', 'meter', 'feet', 'roll', 'bundle', 'set', 'pair', 'litre'],
      default: 'piece',
    },
    supplier: { type: String, trim: true, default: '' },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    variants: { type: [variantSchema], default: [] },
  },
  { timestamps: true },
)

productSchema.index({ business: 1, sku: 1 }, { unique: true })
productSchema.index({ business: 1, barcode: 1 }, { unique: true, partialFilterExpression: { barcode: { $type: 'string', $gt: '' } } })
productSchema.plugin(serialize('productId'))

export const Product = mongoose.model('Product', productSchema)
