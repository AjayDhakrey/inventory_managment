import mongoose from 'mongoose'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import ExcelJS from 'exceljs'
import { Product } from '../models/Product.js'
import { ProductImport } from '../models/ProductImport.js'
import { StockTransaction } from '../models/StockTransaction.js'
import { Supplier } from '../models/Supplier.js'
import { Business } from '../models/Business.js'
import { ApiError } from '../utils/ApiError.js'
import { toObjectId } from '../validators/assert.js'

const MAX_ROWS = 5000
const HEADER_ALIASES = {
  name: ['product name', 'product', 'item name', 'item', 'description'],
  parentSku: ['parent sku', 'parentsku', 'style sku', 'product sku', 'parent product code'],
  sku: ['sku', 'product code', 'item code', 'code'],
  barcode: ['barcode', 'bar code', 'ean', 'upc'],
  category: ['category', 'product category'],
  brand: ['brand', 'make'],
  size: ['size'], color: ['color', 'colour'], quantity: ['quantity', 'qty', 'stock'],
  purchasePrice: ['purchase price', 'purchaseprice', 'cost price', 'costprice', 'cost', 'buy price', 'rate'],
  sellingPrice: ['selling price', 'sellingprice', 'retail price', 'sale price', 'saleprice', 'mrp'],
  wholesalePrice: ['wholesale price', 'wholesale rate', 'bulk price'],
  gstRate: ['gst', 'gst %', 'gst rate', 'gstrate', 'tax', 'tax %'],
  lineTotal: ['line total', 'item total', 'total amount', 'amount'],
  hsnCode: ['hsn', 'hsn code', 'hsncode'], supplierName: ['supplier', 'supplier name', 'vendor'],
  supplierPhone: ['supplier phone', 'vendor phone'], supplierEmail: ['supplier email', 'vendor email'],
  minimumStock: ['minimum stock', 'min stock'], reorderPoint: ['reorder point'], targetStock: ['target stock'], reorderQuantity: ['reorder quantity', 'reorder qty'],
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

const PDF_REQUIRED_FIELDS = ['name', 'sku', 'category', 'quantity', 'sellingPrice']
const PDF_HEADER_WORDS = Math.max(...Object.values(HEADER_ALIASES).flat().map((alias) => alias.split(' ').length))

function pdfLines(items) {
  const lines = []
  for (const item of items) {
    const value = String(item.str || '').trim()
    if (!value) continue
    const y = Number(item.transform?.[5] || 0), x = Number(item.transform?.[4] || 0), width = Number(item.width || 0)
    let line = lines.find((entry) => Math.abs(entry.y - y) <= 2)
    if (!line) { line = { y, cells: [] }; lines.push(line) }
    line.cells.push({ x, end: x + width, value })
  }
  return lines.sort((a, b) => b.y - a.y).map((line) => ({ ...line, cells: line.cells.sort((a, b) => a.x - b.x) }))
}

function headerCandidates(lines, start, depth) {
  const selected = lines.slice(start, start + depth)
  const candidates = []
  for (const line of selected) {
    for (let index = 0; index < line.cells.length; index += 1) {
      for (let length = 1; length <= PDF_HEADER_WORDS && index + length <= line.cells.length; length += 1) {
        const cells = line.cells.slice(index, index + length)
        const field = fieldFor(cells.map((cell) => cell.value).join(' '))
        if (field) candidates.push({ field, x: cells[0].x, end: cells.at(-1).end, y: line.y })
      }
    }
  }
  // Wrapped headings such as "Selling" over "Price" share nearly the same x.
  for (const upper of selected[0]?.cells || []) for (const lowerLine of selected.slice(1)) for (const lower of lowerLine.cells) {
    if (Math.abs(upper.x - lower.x) > 18) continue
    const field = fieldFor(`${upper.value} ${lower.value}`)
    if (field) candidates.push({ field, x: Math.min(upper.x, lower.x), end: Math.max(upper.end, lower.end), y: upper.y })
  }
  const best = new Map()
  for (const candidate of candidates) {
    const current = best.get(candidate.field)
    if (!current || candidate.end - candidate.x > current.end - current.x) best.set(candidate.field, candidate)
  }
  return [...best.values()].sort((a, b) => a.x - b.x)
}

function detectPdfHeader(lines) {
  let best = null
  for (let start = 0; start < Math.min(lines.length, 30); start += 1) for (let depth = 1; depth <= 3; depth += 1) {
    const anchors = headerCandidates(lines, start, depth)
    const required = PDF_REQUIRED_FIELDS.filter((field) => anchors.some((anchor) => anchor.field === field)).length
    const score = anchors.length * 10 + required
    if (!best || score > best.score) best = { start, depth, anchors, score }
  }
  if (!best || best.anchors.length < 5 || PDF_REQUIRED_FIELDS.filter((field) => best.anchors.some((anchor) => anchor.field === field)).length < 3) return null
  const centers = best.anchors.map((anchor) => (anchor.x + anchor.end) / 2)
  return { ...best, bottomY: Math.min(...lines.slice(best.start, best.start + best.depth).map((line) => line.y)), columns: best.anchors.map((anchor, index) => ({ field: anchor.field, x: anchor.x, left: index ? (centers[index - 1] + centers[index]) / 2 : -Infinity, right: index < centers.length - 1 ? (centers[index] + centers[index + 1]) / 2 : Infinity })) }
}

function mapPdfLine(line, header) {
  const mapped = {}
  for (const cell of line.cells) {
    const center = (cell.x + cell.end) / 2
    const column = header.columns.find((entry) => center >= entry.left && center < entry.right)
    if (column) mapped[column.field] = [mapped[column.field], cell.value].filter(Boolean).join(' ').trim()
  }
  return mapped
}

export function mapPositionedPdfItems(items, pageNumber = 1) {
  const lines = pdfLines(items), header = detectPdfHeader(lines)
  if (!header) return { rows: [], debug: { pageNumber, error: 'Unable to detect a reliable PDF table header.', headerMap: [] } }
  const physicalRows = lines.filter((line, index) => index >= header.start + header.depth && line.y < header.bottomY - 1).map((line) => ({ y: line.y, values: mapPdfLine(line, header) })).filter((row) => Object.values(row.values).some(Boolean))
  const rows = []; let pending = null
  for (const physical of physicalRows) {
    const present = Object.keys(physical.values)
    const looksLikeStart = Boolean(physical.values.sku || physical.values.parentSku) && present.length >= 4
    if (looksLikeStart) {
      const row = { ...physical.values, _pdfY: physical.y }
      if (pending) { for (const [field, value] of Object.entries(pending)) row[field] = [value, row[field]].filter(Boolean).join(' ').trim(); pending = null }
      rows.push(row)
    } else if (present.length >= 4) {
      rows.push({ ...physical.values, _pdfY: physical.y, _pdfMappingError: 'Unable to reliably map PDF columns', _pdfMissingFields: PDF_REQUIRED_FIELDS.filter((field) => !physical.values[field]) })
    } else if (!rows.length) {
      pending ||= {}; for (const [field, value] of Object.entries(physical.values)) pending[field] = [pending[field], value].filter(Boolean).join(' ').trim()
    }
    else {
      const previous = rows.at(-1)
      for (const [field, value] of Object.entries(physical.values)) previous[field] = [previous[field], value].filter(Boolean).join(' ').trim()
    }
  }
  for (const row of rows) {
    const missing = PDF_REQUIRED_FIELDS.filter((field) => !String(row[field] || '').trim())
    if (missing.length) { row._pdfMappingError = 'Unable to reliably map PDF columns'; row._pdfMissingFields = missing }
    delete row._pdfY
  }
  return { rows, debug: { pageNumber, headerMap: header.columns.map(({ field, x }) => ({ header: field, field, x: Math.round(x * 100) / 100 })), headerLineCount: header.depth } }
}

async function extractPdf(buffer) {
  const document = await getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useWorkerFetch: false }).promise
  const rows = [], debug = []
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber), content = await page.getTextContent()
      const mapped = mapPositionedPdfItems(content.items, pageNumber)
      rows.push(...mapped.rows); debug.push(mapped.debug)
    }
  } finally { await document.destroy() }
  if (!rows.length) throw new ApiError(422, 'Could not reliably detect a product table in this PDF. Scanned PDFs need OCR; generated PDFs must include recognizable column headings.')
  return { rows, debug }
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
    name: String(raw.name ?? '').trim(), parentSku: String(raw.parentSku ?? '').trim().toUpperCase(), sku: String(raw.sku ?? '').trim().toUpperCase(),
    barcode: String(raw.barcode ?? '').trim(), category: String(raw.category ?? '').trim(),
    brand: String(raw.brand ?? '').trim(), size: String(raw.size ?? '').trim(), color: String(raw.color ?? '').trim(),
    quantity: numberValue(raw.quantity), purchasePrice, sellingPrice: sellingPriceMissing ? purchasePrice : numberValue(raw.sellingPrice),
    wholesalePrice: numberValue(raw.wholesalePrice), gstRate: numberValue(raw.gstRate), hsnCode: String(raw.hsnCode ?? '').trim(),
    supplierName: String(raw.supplierName ?? '').trim(), supplierPhone: String(raw.supplierPhone ?? '').trim(), supplierEmail: String(raw.supplierEmail ?? '').trim().toLowerCase(),
    minimumStock: numberValue(raw.minimumStock), reorderPoint: numberValue(raw.reorderPoint), targetStock: numberValue(raw.targetStock), reorderQuantity: numberValue(raw.reorderQuantity),
    duplicateAction: ['skip', 'update', 'merge'].includes(raw.duplicateAction) ? raw.duplicateAction : 'merge',
  }
  row.errors = []
  row.invalidFields = []
  if (raw._pdfMappingError) {
    const missing = (raw._pdfMissingFields || []).map((field) => field).join(', ')
    row.errors.push(`${raw._pdfMappingError}${missing ? `: ${missing}` : ''}.`)
    row.invalidFields.push(...(raw._pdfMissingFields || []))
  }
  row.warnings = sellingPriceMissing && purchasePrice > 0 ? ['Selling price was not provided; Rate was copied. Review it before importing.'] : []
  if (!row.name) row.errors.push('Product name is required.')
  if (!row.sku) row.errors.push('SKU / product code is required.')
  if (!row.category) row.errors.push('Category is required.')
  for (const key of ['quantity', 'purchasePrice', 'sellingPrice', 'wholesalePrice', 'gstRate', 'minimumStock', 'reorderPoint', 'targetStock', 'reorderQuantity']) if (!Number.isFinite(row[key]) || row[key] < 0) row.errors.push(`${key} must be zero or a positive number.`)
  if (!Number.isInteger(row.quantity)) row.errors.push('Quantity must be a whole number.')
  if (row.gstRate > 100) {
    row.errors.push(`GST must be between 0 and 100. Received ${row.gstRate}. Check that the GST and HSN columns are aligned.`)
    row.invalidFields.push('gstRate')
  }
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
  let rawRows, pdfMapping = null
  try {
    if (extension === 'csv') rawRows = tableToObjects(parseCsv(file.buffer.toString('utf8').replace(/^\uFEFF/, '')))
    else if (extension === 'xlsx') rawRows = await extractExcel(file.buffer)
    else if (extension === 'pdf') { const result = await extractPdf(file.buffer); rawRows = result.rows; pdfMapping = result.debug }
    else throw new ApiError(415, 'Only PDF, CSV and XLSX files are supported.')
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(422, `The ${extension?.toUpperCase() || 'uploaded'} file could not be read. Check that it is not corrupt or password-protected.`)
  }
  if (!rawRows.length) throw new ApiError(422, 'No product rows were found in the uploaded file.')
  if (rawRows.length > MAX_ROWS) throw new ApiError(413, `A maximum of ${MAX_ROWS} product rows can be imported at once.`)
  const rows = await annotateDuplicates(businessId, rawRows.map(normalizeRow))
  return { fileName: file.originalname, fileType: extension, rows, ...(pdfMapping ? { mappingDebug: pdfMapping } : {}), summary: { total: rows.length, valid: rows.filter((row) => row.valid).length, invalid: rows.filter((row) => !row.valid).length, duplicates: rows.filter((row) => row.duplicate).length } }
}

const styleSku = (name) => `${String(name).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'CLOTHING'}-STYLE`
const normalizeSupplierName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')

async function createSupplierResolver(business, selectedSupplier, session) {
  if (selectedSupplier) return async () => selectedSupplier
  const suppliers = await Supplier.find({ business }).select('+normalizedName').session(session)
  const byName = new Map(suppliers.map((item) => [normalizeSupplierName(item.supplierName), item]))
  return async (row) => {
    const supplierName = String(row.supplierName || '').trim().replace(/\s+/g, ' ')
    const normalizedName = normalizeSupplierName(supplierName)
    if (!normalizedName) return null
    if (byName.has(normalizedName)) return byName.get(normalizedName)
    const supplier = await Supplier.findOneAndUpdate(
      { business, normalizedName },
      { $setOnInsert: { business, supplierName, normalizedName, phone: row.supplierPhone || '', email: row.supplierEmail || '', notes: 'Created automatically by product bulk import.' } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true, session },
    )
    byName.set(normalizedName, supplier)
    return supplier
  }
}

async function confirmClothingVariants(businessId, payload, actor, normalizedRows) {
  const business = toObjectId(businessId, 'business'); const importedBy = toObjectId(actor.id, 'user')
  const failures = []; const validRows = []
  const batchSkus = new Set(), batchBarcodes = new Set()
  for (const row of normalizedRows) {
    if (!row.size) row.errors.push('Size is required for variant import.')
    if (!row.color) row.errors.push('Color is required for variant import.')
    if (batchSkus.has(row.sku)) row.errors.push('Duplicate variant SKU inside uploaded file.')
    if (row.barcode && batchBarcodes.has(row.barcode)) row.errors.push('Duplicate variant barcode inside uploaded file.')
    batchSkus.add(row.sku); if (row.barcode) batchBarcodes.add(row.barcode)
    if (row.errors.length) failures.push({ rowNumber: row.rowNumber, sku: row.sku, barcode: row.barcode, name: row.name, reasons: row.errors })
    else validRows.push(row)
  }
  let supplier = null
  if (payload.supplierId) supplier = await Supplier.findOne({ _id: toObjectId(payload.supplierId, 'supplier'), business })
  if (payload.supplierId && !supplier) throw ApiError.notFound('Supplier not found in this business.')
  const counts = { created: 0, updated: 0, merged: 0, skipped: 0 }; let history
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      const resolveSupplier = await createSupplierResolver(business, supplier, session)
      for (const row of validRows) {
        const rowSupplier = await resolveSupplier(row)
        let parent = await Product.findOne({ business, ...(row.parentSku ? { sku: row.parentSku } : { name: row.name, category: row.category }) }).session(session)
        if (!parent) {
          let parentSku = row.parentSku || styleSku(row.name); let suffix = 1
          while (await Product.exists({ business, sku: parentSku }).session(session)) parentSku = `${styleSku(row.name)}-${suffix++}`
          ;[parent] = await Product.create([{ business, name: row.name, sku: parentSku, category: row.category, brand: row.brand, purchasePrice: row.purchasePrice, sellingPrice: row.sellingPrice, wholesalePrice: row.wholesalePrice, gstRate: row.gstRate, hsnCode: row.hsnCode, supplier: rowSupplier?.supplierName || '', supplierId: rowSupplier?._id || null, currentStock: 0, variants: [] }], { session })
        }
        const collision = await Product.findOne({ business, _id: { $ne: parent._id }, $or: [{ sku: row.sku }, { 'variants.sku': row.sku }, ...(row.barcode ? [{ barcode: row.barcode }, { 'variants.barcode': row.barcode }] : [])] }).session(session)
        if (collision) { failures.push({ rowNumber: row.rowNumber, sku: row.sku, barcode: row.barcode, name: row.name, reasons: ['Variant SKU or barcode already belongs to another product.'] }); continue }
        const variant = parent.variants.find((item) => item.sku === row.sku || (item.size.toLowerCase() === row.size.toLowerCase() && item.color.toLowerCase() === row.color.toLowerCase()))
        if (variant && row.duplicateAction === 'skip') { counts.skipped += 1; continue }
        const previousStock = variant?.currentStock || 0
        const newStock = variant && row.duplicateAction === 'merge' ? previousStock + row.quantity : row.quantity
        const values = { size: row.size, color: row.color, sku: row.sku, barcode: row.barcode, purchasePrice: row.purchasePrice, sellingPrice: row.sellingPrice, currentStock: newStock, minimumStock: row.minimumStock, reorderPoint: row.reorderPoint, targetStock: row.targetStock, reorderQuantity: row.reorderQuantity, preferredSupplierId: rowSupplier?._id || null, replenishmentEnabled: row.reorderPoint > 0 || row.targetStock > 0, active: true }
        if (variant) { Object.assign(variant, values); counts[row.duplicateAction === 'merge' ? 'merged' : 'updated'] += 1 } else { parent.variants.push(values); counts.created += 1 }
        parent.currentStock = parent.variants.reduce((sum, item) => sum + item.currentStock, 0); await parent.save({ session })
        const saved = variant || parent.variants[parent.variants.length - 1]
        if (newStock !== previousStock) await StockTransaction.create([{ business, productId: parent._id, variantId: saved._id, variantSku: saved.sku, variantSize: saved.size, variantColor: saved.color, type: 'adjustment', quantity: Math.abs(newStock - previousStock), previousStock, newStock, reason: `Bulk clothing variant import: ${payload.fileName}`, referenceId: String(payload.purchaseReference || ''), createdBy: actor.name }], { session })
      }
      const processed = counts.created + counts.updated + counts.merged
      const status = failures.length ? (processed ? 'partial' : 'failed') : 'completed'
      ;[history] = await ProductImport.create([{ business, fileName: String(payload.fileName || 'import').slice(0, 240), fileType: ['pdf', 'csv', 'xlsx'].includes(payload.fileType) ? payload.fileType : 'csv', variantMode: true, purchaseReference: String(payload.purchaseReference || ''), supplier: supplier?._id || null, supplierName: supplier?.supplierName || '', importedBy, importedByName: actor.name, status, totalRows: normalizedRows.length, createdCount: counts.created, updatedCount: counts.updated, mergedCount: counts.merged, skippedCount: counts.skipped, failedCount: failures.length, failures: failures.slice(0, 500) }], { session })
    })
  } finally { await session.endSession() }
  return { import: history.toJSON(), counts, failures }
}

export async function confirm(businessId, payload, actor) {
  if (!Array.isArray(payload.rows) || !payload.rows.length) throw new ApiError(400, 'No preview rows were supplied.')
  if (payload.rows.length > MAX_ROWS) throw new ApiError(413, `A maximum of ${MAX_ROWS} rows can be imported at once.`)
  const normalizedRows = payload.rows.map(normalizeRow)
  if (payload.variantMode) {
    const business = await Business.findById(toObjectId(businessId, 'business')).select('industry')
    if (String(business?.industry || '').toLowerCase() !== 'clothing') throw new ApiError(403, 'Clothing variant import is only available to Clothing businesses.')
    return confirmClothingVariants(businessId, payload, actor, normalizedRows)
  }
  const rows = await annotateDuplicates(businessId, normalizedRows)
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
      const resolveSupplier = await createSupplierResolver(business, supplier, session)
      const operations = []; const movements = []
      for (const row of validRows) {
        const existing = row.duplicate
        if (existing && row.duplicateAction === 'skip') { counts.skipped += 1; continue }
        const rowSupplier = await resolveSupplier(row)
        const productFields = { name: row.name, sku: row.sku, barcode: row.barcode, category: row.category, brand: row.brand, size: row.size, color: row.color, purchasePrice: row.purchasePrice, sellingPrice: row.sellingPrice, wholesalePrice: row.wholesalePrice, gstRate: row.gstRate, hsnCode: row.hsnCode, supplier: rowSupplier?.supplierName || '', supplierId: rowSupplier?._id || null }
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
