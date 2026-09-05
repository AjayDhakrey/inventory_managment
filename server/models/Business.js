import mongoose from 'mongoose'
import { serialize } from './plugins/serialize.js'

const businessSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    industry: { type: String, required: true, trim: true },
    businessType: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, lowercase: true, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: 'India' },
    currency: { type: String, trim: true, default: 'INR' },
    gstin: { type: String, trim: true, uppercase: true, default: '' },
    enabledModules: { type: [String], default: [] },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    settings: {
      type: new mongoose.Schema(
        {
          lowStockLimit: { type: Number, default: 10 },
          allowNegativeStock: { type: Boolean, default: false },
          defaultPaymentMethod: { type: String, default: 'Cash' },
          taxEnabled: { type: Boolean, default: true },
          invoicePrefix: { type: String, default: 'INV' },
          defaultGstRate: { type: Number, min: 0, max: 100, default: 5 },
          upiId: { type: String, trim: true, default: '' },
          allowPriceOverride: { type: Boolean, default: false },
          loyaltySpendPerPoint: { type: Number, min: 0, default: 100 },
          loyaltyPointValue: { type: Number, min: 0, default: 1 },
          disabledModules: { type: [String], default: [] },
          paymentOffers: {
            type: [{ code: String, label: String, paymentMethod: String, discountType: { type: String, enum: ['percent', 'fixed'], default: 'percent' }, value: { type: Number, min: 0, default: 0 }, minimumAmount: { type: Number, min: 0, default: 0 }, maximumDiscount: { type: Number, min: 0, default: 0 }, active: { type: Boolean, default: true } }],
            default: [],
          },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
  },
  { timestamps: true },
)

businessSchema.plugin(serialize('businessId'))

export const Business = mongoose.model('Business', businessSchema)
