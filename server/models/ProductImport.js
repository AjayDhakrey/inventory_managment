import mongoose from 'mongoose'
import { serialize } from './plugins/serialize.js'

const failureSchema = new mongoose.Schema(
  { rowNumber: Number, sku: String, barcode: String, name: String, reasons: [String] },
  { _id: false },
)

const productImportSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    fileName: { type: String, required: true, trim: true },
    fileType: { type: String, enum: ['pdf', 'csv', 'xlsx'], required: true },
    purchaseReference: { type: String, trim: true, default: '' },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    supplierName: { type: String, trim: true, default: '' },
    importedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    importedByName: { type: String, required: true },
    status: { type: String, enum: ['completed', 'partial', 'failed'], required: true },
    totalRows: { type: Number, default: 0 },
    createdCount: { type: Number, default: 0 },
    updatedCount: { type: Number, default: 0 },
    mergedCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    failures: { type: [failureSchema], default: [] },
  },
  { timestamps: true },
)

productImportSchema.plugin(serialize('importId'))

export const ProductImport = mongoose.model('ProductImport', productImportSchema)
