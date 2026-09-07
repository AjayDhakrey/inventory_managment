import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { productApi } from '../api/productApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'
import '../styles/credit-sales.css'
import '../styles/bulk-pricing.css'
import '../styles/cs-dark.css'

const STOCK_OPTIONS = [
  ['in', 'In stock'],
  ['low', 'Low stock'],
  ['out', 'Out of stock'],
]
const STATUS_OPTIONS = [
  ['active', 'Active'],
  ['below_moq', 'Below MOQ'],
  ['out_of_stock', 'Out of stock'],
]
const pricingStatus = (product) => {
  const stock = Number(product.currentStock || 0)
  const moq = Number(product.wholesaleMinQuantity || 1)
  if (stock <= 0) return 'out_of_stock'
  if (stock < moq) return 'below_moq'
  return 'active'
}
const STATUS_LABEL = { active: 'Active', below_moq: 'Below MOQ', out_of_stock: 'Out of stock' }

function FilterMenu({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('keydown', onKey) }
  }, [open])
  const toggleValue = (value) => onChange(selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value])
  return (
    <div className="bulk-filter-menu" ref={ref}>
      <button type="button" className={`bulk-filter-trigger ${selected.length ? 'active' : ''}`} onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="true">
        {label}{selected.length > 0 && <span className="bulk-filter-count">{selected.length}</span>} <i aria-hidden="true">⌄</i>
      </button>
      {open && (
        <div className="bulk-filter-panel" role="menu">
          {!options.length && <p className="bulk-filter-empty">No options</p>}
          {options.map(({ value, label: optionLabel, count }) => (
            <label key={value} className="bulk-filter-option">
              <input type="checkbox" checked={selected.includes(value)} onChange={() => toggleValue(value)} />
              <span>{optionLabel}</span>
              {count != null && <small>{count}</small>}
            </label>
          ))}
          {selected.length > 0 && <button type="button" className="bulk-filter-reset" onClick={() => onChange([])}>Reset</button>}
        </div>
      )}
    </div>
  )
}

export default function BulkPricing({ business, account }) {
  const load = useCallback(() => productApi.list(), [])
  const { data: products, loading, error, refetch, setData } = useResource(load, [], [])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState([])
  const [colorFilter, setColorFilter] = useState([])
  const [sizeFilter, setSizeFilter] = useState([])
  const [stockFilter, setStockFilter] = useState([])
  const [statusFilter, setStatusFilter] = useState([])
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const canEdit = account?.role === 'owner' || account?.permissions?.includes('edit_product')
  const rows = products.filter((product) => Number(product.wholesalePrice) > 0)
  const countBy = (field, value) => rows.filter((product) => product[field] === value).length
  const categories = [...new Set(rows.map((product) => product.category).filter(Boolean))]
  const colors = [...new Set(rows.map((product) => product.color).filter(Boolean))]
  const sizes = [...new Set(rows.map((product) => product.size).filter(Boolean))]
  const matchesStock = (product) => {
    if (!stockFilter.length) return true
    const stock = Number(product.currentStock || 0)
    const minimum = Number(product.minimumStock || 0)
    return stockFilter.some((entry) => entry === 'out' ? stock <= 0 : entry === 'low' ? stock > 0 && minimum > 0 && stock <= minimum : stock > 0)
  }
  const matchesPrice = (product) => {
    const price = Number(product.wholesalePrice || 0)
    if (priceMin !== '' && price < Number(priceMin)) return false
    if (priceMax !== '' && price > Number(priceMax)) return false
    return true
  }
  const filtered = rows.filter((product) =>
    `${product.name} ${product.sku} ${product.category} ${product.color || ''} ${product.size || ''}`.toLowerCase().includes(search.trim().toLowerCase()) &&
    (!categoryFilter.length || categoryFilter.includes(product.category)) &&
    (!colorFilter.length || colorFilter.includes(product.color)) &&
    (!sizeFilter.length || sizeFilter.includes(product.size)) &&
    matchesStock(product) &&
    (!statusFilter.length || statusFilter.includes(pricingStatus(product))) &&
    matchesPrice(product),
  )
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pages)
  const money = useCallback((value) => `${business.currency === 'INR' ? '₹' : business.currency || '₹'}${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, [business.currency])
  const prices = rows.map((product) => Number(product.wholesalePrice))
  const quantities = rows.map((product) => Number(product.wholesaleMinQuantity || 1))
  const range = (values, format = String) => !values.length ? '—' : Math.min(...values) === Math.max(...values) ? format(values[0]) : `${format(Math.min(...values))} – ${format(Math.max(...values))}`
  const activeChips = useMemo(() => {
    const chips = []
    categoryFilter.forEach((value) => chips.push({ key: `category:${value}`, label: value, onRemove: () => setCategoryFilter((current) => current.filter((entry) => entry !== value)) }))
    colorFilter.forEach((value) => chips.push({ key: `color:${value}`, label: value, onRemove: () => setColorFilter((current) => current.filter((entry) => entry !== value)) }))
    sizeFilter.forEach((value) => chips.push({ key: `size:${value}`, label: `Size ${value}`, onRemove: () => setSizeFilter((current) => current.filter((entry) => entry !== value)) }))
    stockFilter.forEach((value) => chips.push({ key: `stock:${value}`, label: STOCK_OPTIONS.find(([v]) => v === value)?.[1] || value, onRemove: () => setStockFilter((current) => current.filter((entry) => entry !== value)) }))
    statusFilter.forEach((value) => chips.push({ key: `status:${value}`, label: STATUS_LABEL[value], onRemove: () => setStatusFilter((current) => current.filter((entry) => entry !== value)) }))
    if (priceMin !== '' || priceMax !== '') chips.push({ key: 'price', label: `${priceMin !== '' ? money(priceMin) : 'Any'} – ${priceMax !== '' ? money(priceMax) : 'Any'}`, onRemove: () => { setPriceMin(''); setPriceMax('') } })
    return chips
  }, [categoryFilter, colorFilter, sizeFilter, stockFilter, statusFilter, priceMin, priceMax, money])
  const hasActiveFilters = activeChips.length > 0 || search.trim().length > 0
  const clear = () => { setSearch(''); setCategoryFilter([]); setColorFilter([]); setSizeFilter([]); setStockFilter([]); setStatusFilter([]); setPriceMin(''); setPriceMax(''); setPage(1) }
  const exportSheet = () => {
    const cell = (value) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`
    const values = [['Product', 'Category', 'SKU', 'Color', 'Size', 'Wholesale price', 'Currency', 'Minimum quantity', 'Stock'], ...filtered.map((product) => [product.name, product.category, product.sku, product.color, product.size, product.wholesalePrice, business.currency, product.wholesaleMinQuantity, product.currentStock])]
    const url = URL.createObjectURL(new Blob(['﻿' + values.map((row) => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a'); link.href = url; link.download = 'bulk-pricing.csv'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const save = async (event) => {
    event.preventDefault()
    if (saving) return
    const form = new FormData(event.currentTarget)
    setSaving(true); setMessage(null)
    try {
      const saved = await productApi.update(form.get('productId'), { wholesalePrice: Number(form.get('price')), wholesaleMinQuantity: Number(form.get('quantity')) })
      setData((list) => list.map((product) => product.productId === saved.productId ? saved : product))
      setEditing(null); setMessage({ type: 'success', text: 'Bulk pricing saved successfully.' })
      window.dispatchEvent(new Event('stockroom:data-changed'))
    } catch (caught) { setMessage({ type: 'error', text: caught.message || 'Could not save bulk pricing.' }) }
    finally { setSaving(false) }
  }
  const removeRule = async (product) => {
    if (!window.confirm(`Remove the bulk pricing rule for ${product.name} (${product.sku})? This clears its wholesale price and minimum quantity.`)) return
    setMessage(null)
    try {
      const saved = await productApi.update(product.productId, { wholesalePrice: 0, wholesaleMinQuantity: 0 })
      setData((list) => list.map((entry) => entry.productId === saved.productId ? saved : entry))
      setMessage({ type: 'success', text: `Bulk pricing removed for ${product.name}.` })
      window.dispatchEvent(new Event('stockroom:data-changed'))
    } catch (caught) { setMessage({ type: 'error', text: caught.message || 'Could not remove bulk pricing.' }) }
  }
  return <section className="credit-sales bulk-pricing">
    <div className="credit-toolbar"><div><p className="credit-breadcrumb">● Manage your bulk pricing</p><div className="credit-title"><h2>Bulk Pricing</h2><span className="bulk-tag">Wholesale</span></div><p className="bulk-description">Manage volume pricing and minimum order quantities for <strong>{business.name}</strong>.</p></div><div className="credit-buttons"><button onClick={exportSheet} disabled={!filtered.length || loading || !!error}>↥ Export sheet</button>{canEdit && <button className="credit-create" disabled={loading || !!error || !products.length} onClick={() => { setMessage(null); setEditing({}) }}>＋ Add bulk rule</button>}</div></div>
    {!loading && !error && <div className="credit-summary bulk-kpis"><article><div className="credit-stat-label">Total bulk SKUs <span>◇</span></div><strong>{rows.length} SKUs</strong><p>With configured wholesale pricing</p></article><article><div className="credit-stat-label">Bulk price range <span>₹</span></div><strong className="bulk-range">{range(prices, money)}</strong><p>Price per unit across bulk SKUs</p></article><article><div className="credit-stat-label">Stock on hand <span>▣</span></div><strong>{rows.reduce((sum, product) => sum + Number(product.currentStock || 0), 0)} Units</strong><p className="credit-positive">● {rows.filter((product) => Number(product.currentStock) > 0).length} of {rows.length} SKUs in stock</p></article><article><div className="credit-stat-label">MOQ range <span>◇</span></div><strong>{range(quantities)} <small>units</small></strong><p>Configured wholesale minimums</p></article></div>}
    {message && !editing && <p role="status" className={`form-status ${message.type}`}>{message.text}</p>}
    <div className="bulk-filter-card">
      <div className="credit-controls">
        <label className="credit-search"><span aria-hidden="true">⌕</span><input aria-label="Search bulk products" placeholder="Search product name, category, SKU, or variant…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label>
        <button type="button" className="bulk-filters-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((current) => !current)}>
          Filters{activeChips.length > 0 && <span className="bulk-filter-count">{activeChips.length}</span>}
        </button>
      </div>
      <div className={`bulk-filter-row ${filtersOpen ? 'is-open' : ''}`}>
        <FilterMenu label="Category" options={categories.map((value) => ({ value, label: value, count: countBy('category', value) }))} selected={categoryFilter} onChange={(next) => { setCategoryFilter(next); setPage(1) }} />
        <FilterMenu label="Color" options={colors.map((value) => ({ value, label: value, count: countBy('color', value) }))} selected={colorFilter} onChange={(next) => { setColorFilter(next); setPage(1) }} />
        <FilterMenu label="Size" options={sizes.map((value) => ({ value, label: value, count: countBy('size', value) }))} selected={sizeFilter} onChange={(next) => { setSizeFilter(next); setPage(1) }} />
        <FilterMenu label="Stock status" options={STOCK_OPTIONS.map(([value, label]) => ({ value, label }))} selected={stockFilter} onChange={(next) => { setStockFilter(next); setPage(1) }} />
        <FilterMenu label="Pricing status" options={STATUS_OPTIONS.map(([value, label]) => ({ value, label }))} selected={statusFilter} onChange={(next) => { setStatusFilter(next); setPage(1) }} />
        <div className="bulk-filter-menu bulk-price-range">
          <span className="bulk-price-range-label">Price</span>
          <input type="number" min="0" inputMode="decimal" aria-label="Minimum bulk price" placeholder="Min" value={priceMin} onChange={(event) => { setPriceMin(event.target.value); setPage(1) }} />
          <span aria-hidden="true">–</span>
          <input type="number" min="0" inputMode="decimal" aria-label="Maximum bulk price" placeholder="Max" value={priceMax} onChange={(event) => { setPriceMax(event.target.value); setPage(1) }} />
        </div>
      </div>
      {hasActiveFilters && <div className="bulk-active-chips">
        {search.trim() && <span className="bulk-chip">“{search.trim()}” <button type="button" aria-label="Clear search" onClick={() => setSearch('')}>×</button></span>}
        {activeChips.map((chip) => <span key={chip.key} className="bulk-chip">{chip.label} <button type="button" aria-label={`Remove ${chip.label} filter`} onClick={chip.onRemove}>×</button></span>)}
        <button type="button" className="bulk-clear-all" onClick={clear}>Clear all</button>
      </div>}
    </div>
    <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!filtered.length} emptyText={rows.length ? 'No products match your filters.' : 'No bulk pricing configured. Add a bulk rule to an existing product.'}>
      <div className="credit-table-card"><div className="credit-table-scroll"><table className="credit-table bulk-table"><thead><tr><th>Product</th><th>SKU</th><th>Variant</th><th>Category</th><th>Stock</th><th>Retail price</th><th>Bulk price</th><th>MOQ</th><th>Discount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((product) => {
        const regular = Number(product.mrp || product.sellingPrice || 0)
        const discount = regular > Number(product.wholesalePrice) ? (1 - Number(product.wholesalePrice) / regular) * 100 : 0
        const status = pricingStatus(product)
        return <tr key={product.productId}>
          <td><div className="credit-customer"><span className="bulk-product-icon" aria-hidden="true">{product.name?.[0]}</span><strong>{product.name}</strong></div></td>
          <td><code className="bulk-sku">{product.sku}</code></td>
          <td>{[product.color, product.size].filter(Boolean).join(' / ') || '—'}</td>
          <td><span className="bulk-category">{product.category}</span></td>
          <td>{product.currentStock || 0} <small className={Number(product.currentStock) > 0 ? 'credit-positive' : ''}>{Number(product.currentStock) > 0 ? '● In stock' : 'Out of stock'}</small></td>
          <td>{money(regular)}</td>
          <td><strong>{money(product.wholesalePrice)}</strong></td>
          <td>{product.wholesaleMinQuantity || 1}</td>
          <td>{discount > 0 ? <span className="bulk-discount">{discount.toFixed(1)}%</span> : '—'}</td>
          <td><em className={`bulk-status bulk-status-${status}`}>{STATUS_LABEL[status]}</em></td>
          <td><div className="credit-row-actions bulk-row-actions">
            <button type="button" onClick={() => setViewing(product)}>View</button>
            {canEdit ? <>
              <button type="button" className="bulk-edit" onClick={() => { setMessage(null); setEditing(product) }}>Edit</button>
              <button type="button" className="bulk-remove" onClick={() => removeRule(product)}>Remove</button>
            </> : <span className="bulk-readonly">Read only</span>}
          </div></td>
        </tr>
      })}</tbody></table></div><footer className="credit-pagination"><p>Showing {Math.min((currentPage - 1) * pageSize + 1, filtered.length)}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} SKUs</p><label className="bulk-page-size">Rows per page <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>{[10, 25, 50].map((size) => <option key={size}>{size}</option>)}</select></label><PageNumbers currentPage={currentPage} pages={pages} onChange={setPage} /></footer></div>
    </AsyncBoundary>
    {viewing && <div className="credit-form-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setViewing(null) }} onKeyDown={(event) => { if (event.key === 'Escape') setViewing(null) }}>
      <div className="purchase-order-form bulk-view-panel" role="dialog" aria-modal="true" aria-label="Bulk pricing details">
        <div className="product-form-heading"><h3>{viewing.name}</h3><button type="button" autoFocus aria-label="Close details" onClick={() => setViewing(null)}>×</button></div>
        <dl className="bulk-view-grid">
          <div><dt>SKU</dt><dd>{viewing.sku}</dd></div>
          <div><dt>Category</dt><dd>{viewing.category}</dd></div>
          <div><dt>Variant</dt><dd>{[viewing.color, viewing.size].filter(Boolean).join(' / ') || '—'}</dd></div>
          <div><dt>Stock on hand</dt><dd>{viewing.currentStock || 0} units</dd></div>
          <div><dt>Retail price</dt><dd>{money(viewing.mrp || viewing.sellingPrice)}</dd></div>
          <div><dt>Bulk price</dt><dd>{money(viewing.wholesalePrice)}</dd></div>
          <div><dt>Minimum order quantity</dt><dd>{viewing.wholesaleMinQuantity || 1} units</dd></div>
          <div><dt>Pricing status</dt><dd><em className={`bulk-status bulk-status-${pricingStatus(viewing)}`}>{STATUS_LABEL[pricingStatus(viewing)]}</em></dd></div>
        </dl>
        <div className="credit-buttons"><button type="button" onClick={() => setViewing(null)}>Close</button>{canEdit && <button type="button" className="credit-create" onClick={() => { setEditing(viewing); setViewing(null) }}>Edit bulk rule</button>}</div>
      </div>
    </div>}
    {editing && <div className="credit-form-backdrop" onKeyDown={(event) => { if (event.key === 'Escape' && !saving) setEditing(null) }}><form className="purchase-order-form bulk-rule-form" onSubmit={save} aria-label="Bulk pricing rule"><div className="product-form-heading"><h3>{editing.productId ? 'Edit bulk pricing' : 'Add bulk rule'}</h3><button type="button" aria-label="Close bulk rule" disabled={saving} onClick={() => setEditing(null)}>×</button></div><label htmlFor="bulk-product">Product</label><select id="bulk-product" name="productId" defaultValue={editing.productId || ''} required autoFocus><option value="" disabled>Select a product</option>{products.filter((product) => !editing.productId || product.productId === editing.productId).map((product) => <option key={product.productId} value={product.productId}>{product.name} · {product.sku}</option>)}</select><label htmlFor="bulk-price">Wholesale unit price ({business.currency})</label><input id="bulk-price" name="price" type="number" min="0.01" step="0.01" defaultValue={editing.wholesalePrice || ''} required /><label htmlFor="bulk-minimum">Minimum order quantity</label><input id="bulk-minimum" name="quantity" type="number" min="1" step="1" defaultValue={editing.wholesaleMinQuantity || 10} required />{message && <p role="alert" className={`form-status ${message.type}`}>{message.text}</p>}<div className="credit-buttons"><button type="button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button><button className="credit-create" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save rule'}</button></div></form></div>}
  </section>
}

function PageNumbers({ currentPage, pages, onChange }) {
  if (pages <= 1) return <div><button disabled>Previous</button><button aria-current="page" className="credit-current">1</button><button disabled>Next</button></div>
  const numbers = new Set([1, pages, currentPage, currentPage - 1, currentPage + 1].filter((value) => value >= 1 && value <= pages))
  const sorted = [...numbers].sort((a, b) => a - b)
  const items = []
  let previous = 0
  for (const value of sorted) {
    if (previous && value - previous > 1) items.push('…')
    items.push(value)
    previous = value
  }
  return <div className="bulk-page-numbers">
    <button disabled={currentPage === 1} onClick={() => onChange(currentPage - 1)}>Previous</button>
    {items.map((item, index) => item === '…'
      ? <span key={`ellipsis-${index}`} className="bulk-page-ellipsis">…</span>
      : <button key={item} aria-current={item === currentPage ? 'page' : undefined} className={item === currentPage ? 'credit-current' : ''} onClick={() => onChange(item)}>{item}</button>)}
    <button disabled={currentPage === pages} onClick={() => onChange(currentPage + 1)}>Next</button>
  </div>
}
