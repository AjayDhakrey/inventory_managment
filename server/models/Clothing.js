import mongoose from 'mongoose'
import { serialize } from './plugins/serialize.js'

const scoped = { business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true } }
const targets = {
  productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }], categoryNames: [String],
  variantIds: [mongoose.Schema.Types.ObjectId],
}

const promotionSchema = new mongoose.Schema({ ...scoped, name: { type: String, required: true, trim: true }, type: { type: String, enum: ['percentage', 'fixed', 'product', 'category', 'variant', 'seasonal', 'buy_x_get_y', 'bulk'], required: true }, discountValue: { type: Number, min: 0, required: true }, minimumQuantity: { type: Number, min: 1, default: 1 }, buyQuantity: { type: Number, min: 1, default: 1 }, getQuantity: { type: Number, min: 0, default: 0 }, ...targets, startDate: { type: Date, default: null }, endDate: { type: Date, default: null }, active: { type: Boolean, default: true }, usageCount: { type: Number, default: 0 }, discountGranted: { type: Number, default: 0 } }, { timestamps: true })
promotionSchema.index({ business: 1, name: 1 }, { unique: true })
promotionSchema.plugin(serialize('promotionId'))

const couponSchema = new mongoose.Schema({ ...scoped, code: { type: String, required: true, trim: true, uppercase: true }, discountType: { type: String, enum: ['percentage', 'fixed'], required: true }, discountValue: { type: Number, min: 0, required: true }, minimumOrderValue: { type: Number, min: 0, default: 0 }, maximumDiscount: { type: Number, min: 0, default: 0 }, validFrom: { type: Date, default: null }, validUntil: { type: Date, default: null }, totalUsageLimit: { type: Number, min: 0, default: 0 }, perCustomerUsageLimit: { type: Number, min: 0, default: 0 }, ...targets, active: { type: Boolean, default: true }, usageCount: { type: Number, default: 0 }, usages: [{ customerId: mongoose.Schema.Types.ObjectId, orderId: mongoose.Schema.Types.ObjectId, discount: Number, usedAt: Date }] }, { timestamps: true })
couponSchema.index({ business: 1, code: 1 }, { unique: true }); couponSchema.plugin(serialize('couponId'))

const giftCardSchema = new mongoose.Schema({ ...scoped, code: { type: String, required: true, trim: true, uppercase: true }, initialValue: { type: Number, min: 0, required: true }, currentBalance: { type: Number, min: 0, required: true }, issueDate: { type: Date, default: Date.now }, expiryDate: { type: Date, default: null }, active: { type: Boolean, default: true }, customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null }, customerName: { type: String, default: '' }, transactions: [{ type: { type: String, enum: ['Issue', 'Redeem', 'Adjustment'] }, amount: Number, balanceAfter: Number, orderId: mongoose.Schema.Types.ObjectId, processedBy: String, createdAt: Date }] }, { timestamps: true })
giftCardSchema.index({ business: 1, code: 1 }, { unique: true }); giftCardSchema.plugin(serialize('giftCardId'))

const loyaltySchema = new mongoose.Schema({ ...scoped, customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true }, orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder', default: null }, type: { type: String, enum: ['Earn', 'Redeem', 'Adjustment'], required: true }, points: { type: Number, min: 0, required: true }, balanceAfter: { type: Number, min: 0, required: true }, processedBy: String }, { timestamps: true })
loyaltySchema.plugin(serialize('loyaltyTransactionId'))

const creditSchema = new mongoose.Schema({ ...scoped, customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true }, orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder', default: null }, refundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Refund', default: null }, type: { type: String, enum: ['Credit', 'Redeem', 'Adjustment'], required: true }, amount: { type: Number, min: 0, required: true }, balanceAfter: { type: Number, min: 0, required: true }, processedBy: String }, { timestamps: true })
creditSchema.plugin(serialize('storeCreditTransactionId'))

const shiftSchema = new mongoose.Schema({ ...scoped, cashierId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, cashierName: String, openingCash: { type: Number, min: 0, required: true }, startedAt: { type: Date, default: Date.now }, endedAt: { type: Date, default: null }, actualClosingCash: { type: Number, min: 0, default: null }, expectedClosingCash: { type: Number, default: 0 }, difference: { type: Number, default: 0 }, cashIn: { type: Number, min: 0, default: 0 }, cashOut: { type: Number, min: 0, default: 0 }, status: { type: String, enum: ['Open', 'Closed'], default: 'Open' }, closedBy: String }, { timestamps: true })
shiftSchema.index({ business: 1, cashierId: 1, status: 1 }); shiftSchema.plugin(serialize('shiftId'))

export const Promotion = mongoose.model('Promotion', promotionSchema)
export const Coupon = mongoose.model('Coupon', couponSchema)
export const GiftCard = mongoose.model('GiftCard', giftCardSchema)
export const LoyaltyTransaction = mongoose.model('LoyaltyTransaction', loyaltySchema)
export const StoreCreditTransaction = mongoose.model('StoreCreditTransaction', creditSchema)
export const CashierShift = mongoose.model('CashierShift', shiftSchema)
