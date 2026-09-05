import mongoose from 'mongoose'
import { serialize } from './plugins/serialize.js'

const paymentSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    type: { type: String, enum: ['sale', 'purchase'], required: true },
    referenceId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'referenceModel' },
    referenceModel: { type: String, enum: ['SalesOrder', 'PurchaseOrder'], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'UPI', 'QR', 'Card', 'Debit Card', 'Credit Card', 'Bank transfer', 'Credit', 'Pay Later', 'Store Credit', 'Gift Card', 'Other'],
      default: 'Cash',
    },
    paymentDate: { type: String, default: '' },
    notes: { type: String, trim: true, default: '' },
    recordedBy: { type: String, default: '' },
    transactionReference: { type: String, trim: true, default: '' },
    offerCode: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

paymentSchema.plugin(serialize('paymentId'))

export const Payment = mongoose.model('Payment', paymentSchema)
