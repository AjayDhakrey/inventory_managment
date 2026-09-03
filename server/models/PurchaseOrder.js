import mongoose from 'mongoose'
import { serialize } from './plugins/serialize.js'

const itemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    purchasePrice: { type: Number, required: true, min: 0 },
    discount: { type: Number, min: 0, default: 0 },
    tax: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
)

const PO_STATUS = ['Draft', 'Pending', 'Approved', 'Ordered', 'Partially Received', 'Received', 'Cancelled']

const purchaseOrderSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    orderNumber: { type: String, required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierName: { type: String, default: '' },
    items: { type: [itemSchema], validate: (v) => Array.isArray(v) && v.length > 0 },
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    shippingCharges: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, default: 0 },
    status: { type: String, enum: PO_STATUS, default: 'Draft' },
    paymentStatus: { type: String, enum: ['Unpaid', 'Partially Paid', 'Paid'], default: 'Unpaid' },
    expectedDeliveryDate: { type: String, default: '' },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: String, default: '' },
  },
  { timestamps: true },
)

purchaseOrderSchema.plugin(serialize('purchaseOrderId'))

export const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema)
export { PO_STATUS }
