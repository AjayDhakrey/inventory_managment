import { useCallback, useMemo, useState } from 'react'
import { productApi } from '../api/productApi.js'
import { inventoryApi } from '../api/inventoryApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'

function InventoryOperations({ section, business }) {
  const load = useCallback(() => Promise.all([productApi.list(), inventoryApi.transactions()]), [])
  const { data, loading, error, refetch, setData } = useResource(load, [], [[], []])
  const [products, transactions] = data
  const [search, setSearch] = useState('')
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

  const filteredProducts = products.filter((product) => `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(search.toLowerCase()))
  const history = transactions.filter((item) => `${item.type} ${item.reason} ${item.productId}`.toLowerCase().includes(search.toLowerCase()))
  const operation = section === 'Stock In' || section === 'Stock Out' || section === 'Adjustments'

  return <section className="inventory-operations"><div className="products-toolbar"><div><p className="dashboard-kicker">Inventory / {section}</p><h2>{section}</h2><p className="products-count">Business data for {business.name}</p></div>{!operation && <div className="business-filter">{business.currency} · {business.industry}</div>}</div>{operation ? <><form className="stock-operation-form" onSubmit={handleStockSubmit}><div><label htmlFor="stock-product">Product *</label><select id="stock-product" name="productId" defaultValue="" required><option value="" disabled>Select a product</option>{products.map((product) => <option key={product.productId} value={product.productId}>{product.name} ({product.sku})</option>)}</select></div><div><label htmlFor="stock-quantity">{section === 'Adjustments' ? 'New stock quantity *' : 'Quantity *'}</label><input id="stock-quantity" name="quantity" type="number" min="0" step="1" required /></div><div><label htmlFor="stock-reason">Reason</label><input id="stock-reason" name="reason" placeholder={section === 'Stock In' ? 'Purchase or return' : section === 'Stock Out' ? 'Sale or damage' : 'Correction reason'} /></div><button className="submit-button" type="submit" disabled={saving}>{saving ? 'Recording…' : `Record ${section.toLowerCase()}`} <span>→</span></button></form>{message && <p className={`form-status ${message.type}`}>{message.text}</p>}<div className="section-heading operation-heading"><div><p className="dashboard-kicker">Current quantities</p><h2>Stock levels</h2></div><span className="business-filter">{products.length} products</span></div><AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!filteredProducts.length} emptyText="No products match your search."><StockTable products={filteredProducts} business={business} /></AsyncBoundary></> : section === 'Categories' ? <CategoriesView products={products} loading={loading} error={error} refetch={refetch} business={business} /> : section === 'Stock History' ? <><div className="products-controls"><div className="search-box"><span>⌕</span><input aria-label="Search stock history" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, type, or reason" /></div></div><AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!history.length} emptyText="No stock transactions recorded for this business."><div className="history-list">{history.map((item) => <div className="history-row" key={item.transactionId}><span className={`history-type ${item.type}`}>{item.type.replace('_', ' ')}</span><span><strong>{products.find((product) => product.productId === item.productId)?.name || item.productId}</strong><small>{item.reason} · {new Date(item.createdAt).toLocaleString()}</small></span><span className="history-quantity">{item.previousStock} → {item.newStock}</span></div>)}</div></AsyncBoundary></> : <><div className="products-controls"><div className="search-box"><span>⌕</span><input aria-label="Search stock" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products or SKU" /></div></div><AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!filteredProducts.length} emptyText="No products match your search."><StockTable products={filteredProducts} business={business} /></AsyncBoundary></>}</section>
}

function CategoriesView({ products, loading, error, refetch, business }) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all')
  const [view, setView] = useState('grid')
  const categories = useMemo(() => [...new Set(products.map((product) => product.category).filter(Boolean))], [products])
  const stats = useMemo(() => categories.map((category) => {
    const items = products.filter((product) => product.category === category)
    const totalStock = items.reduce((sum, product) => sum + Number(product.currentStock || 0), 0)
    const stockValue = items.reduce((sum, product) => sum + Number(product.currentStock || 0) * Number(product.sellingPrice || 0), 0)
    const outOfStock = items.filter((product) => Number(product.currentStock || 0) <= 0).length
    const lowStock = items.filter((product) => Number(product.currentStock || 0) > 0 && Number(product.currentStock) <= Number(product.minimumStock || 0)).length
    const status = items.length > 0 && outOfStock === items.length ? 'critical' : outOfStock + lowStock > 0 ? 'attention' : 'healthy'
    const earliest = items.reduce((min, product) => !min || new Date(product.createdAt) < new Date(min) ? product.createdAt : min, null)
    const isNew = earliest ? Date.now() - new Date(earliest).getTime() < 30 * 24 * 60 * 60 * 1000 : false
    return { category, count: items.length, totalStock, stockValue, lowStock, outOfStock, status, isNew }
  }), [categories, products])
  const money = (value) => `${business.currency} ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  const totalSkus = products.length
  const newThisMonth = stats.filter((stat) => stat.isNew).length
  const flagged = stats.filter((stat) => stat.status !== 'healthy')
  const topValue = stats.reduce((max, stat) => !max || stat.stockValue > max.stockValue ? stat : max, null)
  const wellStockedCount = stats.filter((stat) => stat.status === 'healthy').length
  const filteredStats = stats
    .filter((stat) => tab === 'all' || (tab === 'healthy' && stat.status === 'healthy') || (tab === 'attention' && stat.status !== 'healthy'))
    .filter((stat) => stat.category.toLowerCase().includes(search.trim().toLowerCase()))
  const maxValue = Math.max(1, ...stats.map((stat) => stat.stockValue))
  const STATUS_LABEL = { critical: 'Out of stock', attention: 'Needs attention', healthy: 'Healthy' }

  return <>
    <div className="category-kpis">
      <article>
        <span className="category-kpi-label">Total categories</span>
        <strong>{categories.length}</strong>
        {newThisMonth > 0 && <em className="category-kpi-badge">+{newThisMonth} new this month</em>}
        <p>Across the {business.name} catalog</p>
      </article>
      <article>
        <span className="category-kpi-label">Catalogued SKUs</span>
        <strong>{totalSkus}</strong>
        <p>Avg {(totalSkus / (categories.length || 1)).toFixed(1)} items / category</p>
      </article>
      <article>
        <span className="category-kpi-label">Highest value category</span>
        <strong>{topValue?.category || '—'}</strong>
        <p>{topValue && topValue.stockValue > 0 ? `${money(topValue.stockValue)} in stock` : 'No stock value yet'}</p>
      </article>
      <article className={flagged.length ? 'category-kpi-alert' : ''}>
        <span className="category-kpi-label">Needs attention</span>
        <strong>{flagged.length}</strong>
        <p>{flagged.length ? flagged.slice(0, 3).map((stat) => stat.category).join(', ') + (flagged.length > 3 ? '…' : '') : 'All categories healthy'}</p>
      </article>
    </div>
    <div className="category-toolbar">
      <div className="category-tabs" role="tablist">
        <button type="button" className={tab === 'all' ? 'active' : ''} aria-pressed={tab === 'all'} onClick={() => setTab('all')}>All categories ({stats.length})</button>
        <button type="button" className={tab === 'healthy' ? 'active' : ''} aria-pressed={tab === 'healthy'} onClick={() => setTab('healthy')}>Well stocked ({wellStockedCount})</button>
        <button type="button" className={tab === 'attention' ? 'active' : ''} aria-pressed={tab === 'attention'} onClick={() => setTab('attention')}>Needs attention ({flagged.length})</button>
      </div>
      <div className="search-box category-search">
        <span aria-hidden="true">⌕</span>
        <input aria-label="Filter categories" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter categories…" />
      </div>
      <div className="category-view-toggle" role="group" aria-label="Category layout">
        <button type="button" aria-pressed={view === 'grid'} aria-label="Grid view" onClick={() => setView('grid')}>▦</button>
        <button type="button" aria-pressed={view === 'list'} aria-label="List view" onClick={() => setView('list')}>☰</button>
      </div>
    </div>
    <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!filteredStats.length} emptyText={stats.length ? 'No categories match this filter.' : 'No categories yet. Add categories while creating products.'}>
      <div className={`category-grid ${view === 'list' ? 'is-list' : ''}`}>
        {filteredStats.map((stat) => (
          <article className={`category-card status-${stat.status}`} key={stat.category} tabIndex={0}>
            <div className="category-card-head">
              <span className="category-mark">◫</span>
              <em className={`category-status status-${stat.status}`}>{STATUS_LABEL[stat.status]}</em>
            </div>
            <strong>{stat.category}</strong>
            <small>{stat.count} product{stat.count === 1 ? '' : 's'}</small>
            <div className="category-metrics">
              <span>Stock <b>{stat.totalStock} units</b></span>
              <span>Value <b>{money(stat.stockValue)}</b></span>
            </div>
            <div className="category-bar" aria-hidden="true"><i style={{ width: `${Math.round((stat.stockValue / maxValue) * 100)}%` }} /></div>
          </article>
        ))}
      </div>
    </AsyncBoundary>
  </>
}

function StockTable({ products, business }) {
  return <div className="products-table"><div className="product-table-row product-table-head"><span>Product</span><span>Category</span><span>Stock</span><span>Status</span></div>{products.map((product) => <div className="product-table-row" key={product.productId}><span className="product-cell"><span className="product-thumb">{product.name[0]}</span><span><strong>{product.name}</strong><small>{product.sku} · {product.unit}</small></span></span><span>{product.category}</span><span className={`product-stock ${product.currentStock <= product.minimumStock ? 'low' : ''}`}>{product.currentStock}</span><span className={`stock-badge ${product.currentStock === 0 ? 'empty' : product.currentStock <= product.minimumStock ? 'low' : ''}`}>{product.currentStock === 0 ? 'Out of stock' : product.currentStock <= product.minimumStock ? 'Low stock' : `In ${business.currency}`}</span></div>)}</div>
}

export default InventoryOperations
