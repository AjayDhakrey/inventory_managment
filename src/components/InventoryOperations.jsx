import { useCallback, useMemo, useState } from 'react'
import { productApi } from '../api/productApi.js'
import { inventoryApi } from '../api/inventoryApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'
import StockInView, { StockOutView } from './StockInView.jsx'
import StockAdjustmentView from './StockAdjustmentView.jsx'
import StockHistoryView from './StockHistoryView.jsx'
import CategoriesView from './CategoriesView.jsx'
import '../styles/stock-ledger.css'

function InventoryOperations({ section, business, account, onNavigate, canNavigate }) {
  const load = useCallback(() => Promise.all([productApi.list(), inventoryApi.transactions()]), [])
  const { data, loading, error, refetch, setData } = useResource(load, [], [[], []])
  const [products, transactions] = data
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)

  const handleStockSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    const form = event.currentTarget
    const data = new FormData(form)
    const productId = data.get('productId')
    const quantity = Number(data.get('quantity'))
    if (!productId || Number.isNaN(quantity) || quantity < 0) {
      setMessage({ type: 'error', text: 'Select a product and enter a valid quantity.' })
      return
    }
    setSaving(true)
    try {
      await inventoryApi.recordOperation({ section, productId, quantity, reason: data.get('reason').trim() })
      const [freshProducts, freshTransactions] = await Promise.all([productApi.list(), inventoryApi.transactions()])
      setData([freshProducts, freshTransactions])
      const product = freshProducts.find((item) => item.productId === productId)
      setMessage({ type: 'success', text: `${section} recorded${product ? ` for ${product.name}. New stock: ${product.currentStock} ${product.unit}.` : '.'}` })
      form.reset()
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || `Could not record the ${section.toLowerCase()}.` })
    } finally {
      setSaving(false)
    }
  }

  if (section === 'Stock') {
    return <StockLedgerView products={products} loading={loading} error={error} refetch={refetch} business={business} onNavigate={onNavigate} />
  }

  if (section === 'Stock In') {
    return <StockInView products={products} transactions={transactions} business={business} loading={loading} error={error} refetch={refetch} saving={saving} message={message} onSubmit={handleStockSubmit} onNavigate={onNavigate} canNavigate={canNavigate} />
  }

  if (section === 'Stock Out') {
    return <StockOutView products={products} transactions={transactions} business={business} account={account} loading={loading} error={error} refetch={refetch} saving={saving} message={message} onSubmit={handleStockSubmit} onNavigate={onNavigate} canNavigate={canNavigate} />
  }

  if (section === 'Adjustments') {
    return <StockAdjustmentView products={products} transactions={transactions} business={business} account={account} loading={loading} error={error} refetch={refetch} saving={saving} message={message} onSubmit={handleStockSubmit} />
  }

  if (section === 'Stock History') {
    return <StockHistoryView transactions={transactions} products={products} business={business} loading={loading} error={error} refetch={refetch} onNavigate={onNavigate} />
  }

  if (section === 'Categories') {
    return <CategoriesView products={products} business={business} loading={loading} error={error} refetch={refetch} onNavigate={onNavigate} />
  }

  return <section className="inventory-operations"><div className="products-toolbar"><div><p className="dashboard-kicker">Inventory / {section}</p><h2>{section}</h2><p className="products-count">Business data for {business.name}</p></div><div className="business-filter">{business.currency} · {business.industry}</div></div><AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!products.length} emptyText="No products in this workspace yet."><StockTable products={products} business={business} /></AsyncBoundary></section>
}

function StockLedgerView({ products, loading, error, refetch, business, onNavigate }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const [selected, setSelected] = useState([])
  const categories = useMemo(() => [...new Set(products.map((product) => product.category).filter(Boolean))].sort(), [products])
  const counts = useMemo(() => products.reduce((result, product) => {
    const stock = Number(product.currentStock || 0)
    const minimum = Number(product.minimumStock || 0)
    result.units += stock
    result.value += stock * Number(product.purchasePrice || 0)
    if (stock === 0) result.out += 1
    else if (stock <= minimum) result.low += 1
    else result.in += 1
    return result
  }, { units: 0, value: 0, in: 0, low: 0, out: 0 }), [products])
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return products.filter((product) => {
      const stock = Number(product.currentStock || 0)
      const minimum = Number(product.minimumStock || 0)
      const stockStatus = stock === 0 ? 'out' : stock <= minimum ? 'low' : 'in'
      const matchesSearch = !query || `${product.name} ${product.sku} ${product.category} ${product.brand || ''} ${product.rackLocation || ''}`.toLowerCase().includes(query)
      return matchesSearch && (status === 'all' || status === stockStatus) && (category === 'all' || category === product.category)
    })
  }, [products, search, status, category])
  const allVisibleSelected = visible.length > 0 && visible.every((product) => selected.includes(product.productId))
  const money = (value) => `${business.currency} ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  const exportLedger = () => {
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const rows = [['Product', 'SKU', 'Category', 'Bin / Rack', 'Available Stock', 'Unit', 'Unit Price', 'Status'], ...visible.map((product) => {
      const stock = Number(product.currentStock || 0)
      return [product.name, product.sku, product.category, product.rackLocation || product.warehouse || 'Unassigned', stock, product.unit, product.sellingPrice, stock === 0 ? 'Out of stock' : stock <= Number(product.minimumStock || 0) ? 'Low stock' : 'In stock']
    })]
    const blob = new Blob([rows.map((row) => row.map(escape).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `stock-ledger-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }
  const toggleAll = () => setSelected(allVisibleSelected ? selected.filter((id) => !visible.some((product) => product.productId === id)) : [...new Set([...selected, ...visible.map((product) => product.productId)])])

  return <section className="stock-ledger-page">
    <div className="stock-ledger-heading">
      <div><div className="stock-ledger-title"><h2>Stock Ledger</h2><span>Live mode</span></div><p>Real-time balance, cost valuation, and SKU alerts for {business.name}.</p></div>
      <div className="stock-ledger-actions"><button type="button" onClick={exportLedger} disabled={!visible.length}>⇩ Export ledger</button><button type="button" onClick={() => onNavigate?.('Adjustments')}>⌁ Audit count</button><button className="primary" type="button" onClick={() => onNavigate?.('Stock In')}>＋ Inward stock</button></div>
    </div>
    <div className="stock-ledger-kpis">
      <article><span>Total units on hand <i>◇</i></span><strong>{counts.units.toLocaleString('en-IN')}</strong><p>Across {products.length} catalogued SKUs</p></article>
      <article><span>Inventory valuation <i className="green">₹</i></span><strong>{money(counts.value)}</strong><p>Weighted using recorded purchase cost</p></article>
      <article className="critical"><span>Critical low stock <i>△</i></span><strong>{counts.low + counts.out} <small>items</small></strong><p>At or below the configured threshold</p></article>
      <article><span>Catalog density <i className="purple">▤</i></span><strong>{products.length} <small>SKUs</small></strong><p>{categories.length} {categories.length === 1 ? 'category' : 'categories'} in this workspace</p></article>
    </div>
    <div className="stock-ledger-filters">
      <label className="ledger-search"><span>⌕</span><input aria-label="Search stock ledger" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, SKU, tag…" /><kbd>Ctrl+K</kbd></label>
      <div className="ledger-status-tabs">
        {[['all', 'All items', products.length], ['in', 'In stock', counts.in], ['low', 'Low stock', counts.low], ['out', 'Out of stock', counts.out]].map(([value, label, count]) => <button type="button" key={value} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}><i className={value} />{label}<b>{count}</b></button>)}
      </div>
      <select aria-label="Filter stock category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
    </div>
    <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!visible.length} emptyText={products.length ? 'No products match these filters.' : 'No products in this workspace yet.'}>
      <div className="stock-ledger-table-wrap"><div className="stock-ledger-table">
        <div className="ledger-row ledger-head"><span><input type="checkbox" aria-label="Select all visible products" checked={allVisibleSelected} onChange={toggleAll} /></span><span>Product &amp; SKU</span><span>Category</span><span>Bin location</span><span>Available stock</span><span>Unit price</span><span>Stock status</span><span>Actions</span></div>
        {visible.map((product) => {
          const stock = Number(product.currentStock || 0)
          const state = stock === 0 ? 'out' : stock <= Number(product.minimumStock || 0) ? 'low' : 'in'
          return <div className="ledger-row" key={product.productId}><span><input type="checkbox" aria-label={`Select ${product.name}`} checked={selected.includes(product.productId)} onChange={() => setSelected((current) => current.includes(product.productId) ? current.filter((id) => id !== product.productId) : [...current, product.productId])} /></span><span className="ledger-product"><span className="ledger-product-mark">{product.name[0]}</span><span><strong>{product.name}</strong><small>{product.sku}{product.color ? ` · ${product.color}` : ''}{product.size ? ` / ${product.size}` : ''}</small></span></span><span><strong>{product.category || 'Uncategorised'}</strong><small>{product.brand || 'General catalog'}</small></span><span><code>{product.rackLocation || product.warehouse || 'Unassigned'}</code></span><span className={`ledger-stock ${state}`}>{stock.toLocaleString('en-IN')} <small>{product.unit || 'unit'}</small></span><span className="ledger-price">{money(product.sellingPrice)}</span><span><em className={`ledger-badge ${state}`}><i />{state === 'out' ? 'Out of stock' : state === 'low' ? 'Low stock' : 'In stock'}</em></span><span className="ledger-row-actions"><button type="button" onClick={() => onNavigate?.('Adjustments')}>Adjust</button><button type="button" aria-label={`More actions for ${product.name}`}>⋮</button></span></div>
        })}
      </div></div>
    </AsyncBoundary>
  </section>
}

function StockTable({ products, business }) {
  return <div className="products-table"><div className="product-table-row product-table-head"><span>Product</span><span>Category</span><span>Stock</span><span>Status</span></div>{products.map((product) => <div className="product-table-row" key={product.productId}><span className="product-cell"><span className="product-thumb">{product.name[0]}</span><span><strong>{product.name}</strong><small>{product.sku} · {product.unit}</small></span></span><span>{product.category}</span><span className={`product-stock ${product.currentStock <= product.minimumStock ? 'low' : ''}`}>{product.currentStock}</span><span className={`stock-badge ${product.currentStock === 0 ? 'empty' : product.currentStock <= product.minimumStock ? 'low' : ''}`}>{product.currentStock === 0 ? 'Out of stock' : product.currentStock <= product.minimumStock ? 'Low stock' : `In ${business.currency}`}</span></div>)}</div>
}

export default InventoryOperations
