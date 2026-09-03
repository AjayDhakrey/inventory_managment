import mongoose from 'mongoose'
import { serialize } from './plugins/serialize.js'

const itemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    sellingPrice: { type: Number, required: true, min: 0 },
    discount: { type: Number, min: 0, default: 0 },
    tax: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, default: 0 },
    gstRate: { type: Number, min: 0, default: 0 },
    hsnCode: { type: String, default: '' },
    taxableAmount: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
)

const salesOrderSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    orderNumber: { type: String, required: true },
    invoiceNumber: { type: String, default: '' },
    channel: { type: String, enum: ['Order', 'POS'], default: 'Order', index: true },
    billingType: { type: String, enum: ['retail', 'wholesale'], default: 'retail' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, default: '' },
    customerSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    items: { type: [itemSchema], validate: (v) => Array.isArray(v) && v.length > 0 },
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    offerDiscount: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['Pending', 'Completed', 'Cancelled'], default: 'Pending' },
    paymentStatus: { type: String, enum: ['Unpaid', 'Partially Paid', 'Paid'], default: 'Unpaid' },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: String, default: '' },
    cashierId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cashierName: { type: String, default: '' },
    amountPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    paymentSummary: { type: [new mongoose.Schema({ method: String, amount: Number, reference: String }, { _id: false })], default: [] },
    cancelledAt: { type: Date, default: null },
    refundedAmount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true },
)

salesOrderSchema.plugin(serialize('orderId'))
salesOrderSchema.index({ business: 1, invoiceNumber: 1 }, { unique: true, partialFilterExpression: { invoiceNumber: { $type: 'string', $gt: '' } } })

export const SalesOrder = mongoose.model('SalesOrder', salesOrderSchema)
