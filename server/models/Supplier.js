import mongoose from 'mongoose'
import { serialize } from './plugins/serialize.js'

const supplierSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    supplierName: { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, lowercase: true, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    taxNumber: { type: String, trim: true, default: '' },
    paymentTerms: {
      type: String,
      enum: ['Due on receipt', 'Net 7', 'Net 15', 'Net 30', 'Net 60'],
      default: 'Due on receipt',
    },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

supplierSchema.plugin(serialize('supplierId'))

export const Supplier = mongoose.model('Supplier', supplierSchema)
