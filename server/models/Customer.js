import mongoose from 'mongoose'
import { serialize } from './plugins/serialize.js'

const customerSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, lowercase: true, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    gstin: { type: String, trim: true, uppercase: true, default: '' },
    customerType: { type: String, enum: ['retail', 'wholesale', 'dealer', 'contractor'], default: 'retail' },
    creditLimit: { type: Number, min: 0, default: 0 },
    paymentTerms: { type: String, trim: true, default: 'Due on receipt' },
    notes: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    totalPurchases: { type: Number, min: 0, default: 0 },
    outstandingBalance: { type: Number, default: 0 },
    creditBalance: { type: Number, min: 0, default: 0 },
    loyaltyPoints: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true },
)

customerSchema.plugin(serialize('customerId'))

export const Customer = mongoose.model('Customer', customerSchema)
