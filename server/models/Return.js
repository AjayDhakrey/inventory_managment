import mongoose from 'mongoose'
import { serialize } from './plugins/serialize.js'

const returnSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    type: { type: String, enum: ['sale', 'purchase'], required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'orderModel' },
    orderModel: { type: String, enum: ['SalesOrder', 'PurchaseOrder'], required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    variantSku: { type: String, trim: true, default: '' },
    variantSize: { type: String, trim: true, default: '' },
    variantColor: { type: String, trim: true, default: '' },
    productName: { type: String, default: '' },
    productSku: { type: String, default: '' },
    productVariant: { type: String, default: '' },
    orderNumber: { type: String, default: '' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    reason: {
      type: String,
      enum: ['Damaged product', 'Defective product', 'Incorrect product', 'Customer changed mind', 'Size/Fit issue', 'Other'],
      default: 'Other',
    },
    reasonDetails: { type: String, trim: true, default: '' },
    condition: { type: String, enum: ['Sellable', 'Damaged', 'Defective', 'Opened / Used', 'Other'], default: 'Sellable' },
    soldQuantity: { type: Number, min: 0, default: 0 },
    unitSellingPrice: { type: Number, min: 0, default: 0 },
    lineDiscount: { type: Number, min: 0, default: 0 },
    lineTax: { type: Number, min: 0, default: 0 },
    returnValue: { type: Number, min: 0, default: 0 },
    outstandingBefore: { type: Number, min: 0, default: 0 },
    outstandingAdjustment: { type: Number, min: 0, default: 0 },
    refundRequired: { type: Number, min: 0, default: 0 },
    refundAmount: { type: Number, min: 0, default: 0 },
    remainingRefund: { type: Number, min: 0, default: 0 },
    refundMethod: { type: String, default: '' },
    refundStatus: { type: String, enum: ['Not Required', 'Pending', 'Partially Refunded', 'Refunded', 'Failed', 'Cancelled'], default: 'Not Required' },
    inventoryAction: { type: String, enum: ['sellable', 'damaged', 'defective', 'openedUsed', 'other'], default: 'sellable' },
    status: { type: String, enum: ['Pending', 'Completed', 'Cancelled'], default: 'Completed' },
    processedBy: { type: String, default: '' },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    idempotencyKey: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

returnSchema.plugin(serialize('returnId'))
returnSchema.index({ business: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string', $gt: '' } } })

export const Return = mongoose.model('Return', returnSchema)
