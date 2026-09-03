import mongoose from 'mongoose'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import ExcelJS from 'exceljs'
import { Product } from '../models/Product.js'
import { ProductImport } from '../models/ProductImport.js'
import { StockTransaction } from '../models/StockTransaction.js'
import { Supplier } from '../models/Supplier.js'
import { ApiError } from '../utils/ApiError.js'
import { toObjectId } from '../validators/assert.js'

const MAX_ROWS = 5000
const HEADER_ALIASES = {
  name: ['product name', 'product', 'item name', 'item', 'description'],
  sku: ['sku', 'product code', 'item code', 'code'],
  barcode: ['barcode', 'bar code', 'ean', 'upc'],
  category: ['category', 'product category'],
  brand: ['brand', 'make'],
  size: ['size'], color: ['color', 'colour'], quantity: ['quantity', 'qty', 'stock'],
  purchasePrice: ['purchase price', 'cost price', 'cost', 'buy price', 'rate'],
  sellingPrice: ['selling price', 'retail price', 'sale price', 'mrp'],
  wholesalePrice: ['wholesale price', 'wholesale rate', 'bulk price'],
  gstRate: ['gst', 'gst %', 'gst rate', 'tax', 'tax %'],
  lineTotal: ['line total', 'item total', 'total amount', 'amount'],
  hsnCode: ['hsn', 'hsn code'], supplierName: ['supplier', 'supplier name', 'vendor'],
  supplierPhone: ['supplier phone', 'vendor phone'], supplierEmail: ['supplier email', 'vendor email'],
}

const normalizedHeader = (value) => String(value ?? '').toLowerCase().replace(/[%._()-]/g, ' ').replace(/\s+/g, ' ').trim()
const fieldFor = (header) => Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(normalizedHeader(header)))?.[0]

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(cell); cell = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell); if (row.some((value) => String(value).trim())) rows.push(row); row = []; cell = ''
    } else cell += char
  }
  row.push(cell); if (row.some((value) => String(value).trim())) rows.push(row)
  return rows
}

function tableToObjects(table) {
  if (table.length < 2) return []
  let headerIndex = table.findIndex((row) => row.filter((cell) => fieldFor(cell)).length >= 2)
  if (headerIndex < 0) headerIndex = 0
  const fields = table[headerIndex].map(fieldFor)
  return table.slice(headerIndex + 1).filter((row) => row.some((cell) => String(cell ?? '').trim()) && row.filter((cell) => fieldFor(cell)).length < 2).map((row) => {
    const result = {}
    fields.forEach((field, index) => { if (field) result[field] = row[index] ?? '' })
    return result
  })
}

async function extractExcel(buffer) {
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return []
  const table = []
  sheet.eachRow({ includeEmpty: false }, (row) => table.push(row.values.slice(1).map((value) => value?.text ?? value?.result ?? value ?? '')))
  return tableToObjects(table)
}

async function extractPdf(buffer) {
  const document = await getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useWorkerFetch: false }).promise
  const lines = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber); const content = await page.getTextContent(); const grouped = []
    for (const item of content.items) {
      const y = Math.round(item.transform?.[5] || 0); let line = grouped.find((entry) => Math.abs(entry.y - y) <= 2)
      if (!line) { line = { y, cells: [] }; grouped.push(line) }
      line.cells.push({ x: item.transform?.[4] || 0, value: item.str })
    }
    grouped.sort((a, b) => b.y - a.y).forEach((line) => lines.push(line.cells.sort((a, b) => a.x - b.x).map((cell) => cell.value.trim()).filter(Boolean).join('\t')))
  }
  await document.destroy()
  if (!lines.length) throw new ApiError(422, 'No selectable text was found in this PDF. Scanned-image PDFs need OCR before import.')
  const delimiter = lines.some((line) => line.includes('|')) ? /\s*\|\s*/ : /\t+|\s{2,}/
  const table = lines.map((line) => line.split(delimiter).map((cell) => cell.trim())).filter((row) => row.length > 1)
  const objects = tableToObjects(table)
  if (!objects.length) throw new ApiError(422, 'Could not detect a product table. Include recognizable column headings such as Product Name, SKU, Quantity and Selling Price.')
  return objects
}

const numberValue = (value) => {
  if (value === '' || value === null || value === undefined) return 0
  const number = Number(String(value).replace(/[₹,$%\s]/g, ''))
  return Number.isFinite(number) ? number : Number.NaN
}

function normalizeRow(raw, index) {
  const purchasePrice = numberValue(raw.purchasePrice)
  const sellingPriceMissing = raw.sellingPrice === '' || raw.sellingPrice === null || raw.sellingPrice === undefined
  const row = {
    rowNumber: index + 2,
    name: String(raw.name ?? '').trim(), sku: String(raw.sku ?? '').trim().toUpperCase(),
    barcode: String(raw.barcode ?? '').trim(), category: String(raw.category ?? '').trim(),
    brand: String(raw.brand ?? '').trim(), size: String(raw.size ?? '').trim(), color: String(raw.color ?? '').trim(),
    quantity: numberValue(raw.quantity), purchasePrice, sellingPrice: sellingPriceMissing ? purchasePrice : numberValue(raw.sellingPrice),
    wholesalePrice: numberValue(raw.wholesalePrice), gstRate: numberValue(raw.gstRate), hsnCode: String(raw.hsnCode ?? '').trim(),
    supplierName: String(raw.supplierName ?? '').trim(), supplierPhone: String(raw.supplierPhone ?? '').trim(), supplierEmail: String(raw.supplierEmail ?? '').trim().toLowerCase(),
    duplicateAction: ['skip', 'update', 'merge'].includes(raw.duplicateAction) ? raw.duplicateAction : 'merge',
  }
  row.errors = []
  row.warnings = sellingPriceMissing && purchasePrice > 0 ? ['Selling price was not provided; Rate was copied. Review it before importing.'] : []
  if (!row.name) row.errors.push('Product name is required.')
  if (!row.sku) row.errors.push('SKU / product code is required.')
  if (!row.category) row.errors.push('Category is required.')
  for (const key of ['quantity', 'purchasePrice', 'sellingPrice', 'wholesalePrice', 'gstRate']) if (!Number.isFinite(row[key]) || row[key] < 0) row.errors.push(`${key} must be zero or a positive number.`)
  if (!Number.isInteger(row.quantity)) row.errors.push('Quantity must be a whole number.')
  if (row.gstRate > 100) row.errors.push('GST rate cannot exceed 100%.')
  const lineTotal = numberValue(raw.lineTotal)
  const calculatedLineTotal = row.quantity * row.purchasePrice * (1 + row.gstRate / 100)
  if (Number.isFinite(lineTotal) && lineTotal > 0 && Math.abs(lineTotal - calculatedLineTotal) > 1) row.warnings.push('Line Total does not match Qty × Rate plus GST. Please review.')
  return row
}

async function annotateDuplicates(businessId, rows) {
  const business = toObjectId(businessId, 'business')
  const skus = rows.map((row) => row.sku).filter(Boolean); const barcodes = rows.map((row) => row.barcode).filter(Boolean)
  const existing = await Product.find({ business, $or: [{ sku: { $in: skus } }, { barcode: { $in: barcodes } }] }).select('_id sku barcode name currentStock').lean()
  const skuMap = new Map(existing.map((item) => [item.sku, item])); const barcodeMap = new Map(existing.filter((item) => item.barcode).map((item) => [item.barcode, item]))
  const fileSkus = new Set(); const fileBarcodes = new Set()
  return rows.map((row) => {
    const skuMatch = skuMap.get(row.sku); const barcodeMatch = row.barcode ? barcodeMap.get(row.barcode) : null
    if (skuMatch && barcodeMatch && String(skuMatch._id) !== String(barcodeMatch._id)) row.errors.push('SKU and barcode match two different existing products.')
    if (fileSkus.has(row.sku)) row.errors.push('Duplicate SKU inside uploaded file.')
    if (row.barcode && fileBarcodes.has(row.barcode)) row.errors.push('Duplicate barcode inside uploaded file.')
    fileSkus.add(row.sku); if (row.barcode) fileBarcodes.add(row.barcode)
    const match = skuMatch || barcodeMatch
    return { ...row, duplicate: match ? { productId: String(match._id), name: match.name, sku: match.sku, currentStock: match.currentStock } : null, valid: row.errors.length === 0 }
  })
}

export async function extract(businessId, file) {
  if (!file) throw new ApiError(400, 'Choose a PDF, CSV or XLSX file.')
  const extension = file.originalname.split('.').pop()?.toLowerCase()
  let rawRows
  try {
    if (extension === 'csv') rawRows = tableToObjects(parseCsv(file.buffer.toString('utf8').replace(/^\uFEFF/, '')))
    else if (extension === 'xlsx') rawRows = await extractExcel(file.buffer)
    else if (extension === 'pdf') rawRows = await extractPdf(file.buffer)
    else throw new ApiError(415, 'Only PDF, CSV and XLSX files are supported.')
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(422, `The ${extension?.toUpperCase() || 'uploaded'} file could not be read. Check that it is not corrupt or password-protected.`)
  }
  if (!rawRows.length) throw new ApiError(422, 'No product rows were found in the uploaded file.')
  if (rawRows.length > MAX_ROWS) throw new ApiError(413, `A maximum of ${MAX_ROWS} product rows can be imported at once.`)
  const rows = await annotateDuplicates(businessId, rawRows.map(normalizeRow))
  return { fileName: file.originalname, fileType: extension, rows, summary: { total: rows.length, valid: rows.filter((row) => row.valid).length, invalid: rows.filter((row) => !row.valid).length, duplicates: rows.filter((row) => row.duplicate).length } }
}

export async function confirm(businessId, payload, actor) {
  if (!Array.isArray(payload.rows) || !payload.rows.length) throw new ApiError(400, 'No preview rows were supplied.')
  if (payload.rows.length > MAX_ROWS) throw new ApiError(413, `A maximum of ${MAX_ROWS} rows can be imported at once.`)
  const rows = await annotateDuplicates(businessId, payload.rows.map(normalizeRow))
  const failures = rows.filter((row) => !row.valid).map((row) => ({ rowNumber: row.rowNumber, sku: row.sku, barcode: row.barcode, name: row.name, reasons: row.errors }))
  const validRows = rows.filter((row) => row.valid)
  const business = toObjectId(businessId, 'business'); const importedBy = toObjectId(actor.id, 'user')
  let supplier = null
  if (payload.supplierId) supplier = await Supplier.findOne({ _id: toObjectId(payload.supplierId, 'supplier'), business })
  if (payload.supplierId && !supplier) throw ApiError.notFound('Supplier not found in this business.')
  const session = await mongoose.startSession(); const counts = { created: 0, updated: 0, merged: 0, skipped: 0 }
  let history
  try {
    await session.withTransaction(async () => {
      const operations = []; const movements = []
      for (const row of validRows) {
        const existing = row.duplicate
        if (existing && row.duplicateAction === 'skip') { counts.skipped += 1; continue }
        const productFields = { name: row.name, sku: row.sku, barcode: row.barcode, category: row.category, brand: row.brand, size: row.size, color: row.color, purchasePrice: row.purchasePrice, sellingPrice: row.sellingPrice, wholesalePrice: row.wholesalePrice, gstRate: row.gstRate, hsnCode: row.hsnCode, supplier: row.supplierName || supplier?.supplierName || '' }
        let productId; let previousStock = 0; let newStock = row.quantity
        if (existing) {
          productId = toObjectId(existing.productId, 'product'); previousStock = existing.currentStock
          newStock = row.duplicateAction === 'merge' ? previousStock + row.quantity : row.quantity
          operations.push({ updateOne: { filter: { _id: productId, business }, update: { $set: { ...productFields, currentStock: newStock } } } })
          counts[row.duplicateAction === 'merge' ? 'merged' : 'updated'] += 1
        } else {
          productId = new mongoose.Types.ObjectId()
          operations.push({ insertOne: { document: { _id: productId, business, ...productFields, currentStock: newStock } } }); counts.created += 1
        }
        if (newStock !== previousStock) movements.push({ business, productId, type: 'adjustment', quantity: Math.abs(newStock - previousStock), previousStock, newStock, reason: `Bulk product import: ${payload.fileName}`, referenceId: String(payload.purchaseReference || ''), createdBy: actor.name })
      }
      if (operations.length) await Product.bulkWrite(operations, { ordered: false, session })
      if (movements.length) await StockTransaction.insertMany(movements, { session })
      const processed = counts.created + counts.updated + counts.merged
      const status = failures.length ? (processed ? 'partial' : 'failed') : 'completed'
      ;[history] = await ProductImport.create([{ business, fileName: String(payload.fileName || 'import').slice(0, 240), fileType: ['pdf', 'csv', 'xlsx'].includes(payload.fileType) ? payload.fileType : 'csv', purchaseReference: String(payload.purchaseReference || ''), supplier: supplier?._id || null, supplierName: supplier?.supplierName || String(payload.supplierName || ''), importedBy, importedByName: actor.name, status, totalRows: rows.length, createdCount: counts.created, updatedCount: counts.updated, mergedCount: counts.merged, skippedCount: counts.skipped, failedCount: failures.length, failures: failures.slice(0, 500) }], { session })
    })
  } finally { await session.endSession() }
  return { import: history.toJSON(), counts, failures }
}

export async function history(businessId) {
  const docs = await ProductImport.find({ business: toObjectId(businessId, 'business') }).sort('-createdAt').limit(100)
  return docs.map((doc) => doc.toJSON())
}
