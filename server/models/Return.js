import mongoose from 'mongoose'
import { serialize } from './plugins/serialize.js'

const returnSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    type: { type: String, enum: ['sale', 'purchase'], required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'orderModel' },
    orderModel: { type: String, enum: ['SalesOrder', 'PurchaseOrder'], required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    reason: {
      type: String,
      enum: ['Damaged product', 'Defective product', 'Incorrect product', 'Other'],
      default: 'Other',
    },
    refundAmount: { type: Number, min: 0, default: 0 },
    status: { type: String, default: 'Completed' },
    processedBy: { type: String, default: '' },
  },
  { timestamps: true },
)

returnSchema.plugin(serialize('returnId'))

export const Return = mongoose.model('Return', returnSchema)
