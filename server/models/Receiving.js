import mongoose from 'mongoose'
import { serialize } from './plugins/serialize.js'

const receivingItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    orderedQuantity: { type: Number, default: 0 },
    receivedQuantity: { type: Number, min: 0, default: 0 },
    damagedQuantity: { type: Number, min: 0, default: 0 },
    rejectedQuantity: { type: Number, min: 0, default: 0 },
    acceptedQuantity: { type: Number, min: 0, default: 0 },
    batchNumber: { type: String, default: '' },
    expiryDate: { type: String, default: '' },
  },
  { _id: false },
)

const receivingSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    items: { type: [receivingItemSchema], default: [] },
    receivedBy: { type: String, default: '' },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

receivingSchema.plugin(serialize('receivingId'))

// Expose createdAt under the name the frontend already reads.
receivingSchema.virtual('receivedAt').get(function receivedAt() {
  return this.createdAt
})
receivingSchema.set('toJSON', {
  transform(_doc, ret) {
    if (ret._id != null) ret.receivingId = String(ret._id)
    ret.receivedAt = ret.receivedAt || ret.createdAt
    delete ret.__v
    return ret
  },
})

export const Receiving = mongoose.model('Receiving', receivingSchema)
