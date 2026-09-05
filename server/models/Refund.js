import mongoose from 'mongoose'
import { serialize } from './plugins/serialize.js'

const allocationSchema = new mongoose.Schema({ method: String, amount: Number }, { _id: false })
const refundSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    returnId: { type: mongoose.Schema.Types.ObjectId, ref: 'Return', required: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder', required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, default: '' },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, required: true },
    resolvedMethod: { type: String, default: '' },
    allocations: { type: [allocationSchema], default: [] },
    status: { type: String, enum: ['Pending', 'Refunded', 'Failed', 'Cancelled'], default: 'Pending' },
    transactionReference: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    processedBy: { type: String, default: '' },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

refundSchema.plugin(serialize('refundId'))
export const Refund = mongoose.model('Refund', refundSchema)
