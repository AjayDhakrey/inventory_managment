import { useCallback, useEffect, useMemo, useState } from 'react'
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
  const categories = useMemo(() => [...new Set(products.map((product) => product.category))], [products])
  const history = transactions.filter((item) => `${item.type} ${item.reason} ${item.productId}`.toLowerCase().includes(search.toLowerCase()))
  const operation = section === 'Stock In' || section === 'Stock Out' || section === 'Adjustments'

  useEffect(() => {
    if (section !== 'Categories') return
    const cards = document.querySelectorAll('.category-grid .category-card')
    cards.forEach((card, index) => {
      const category = categories[index]
      const categoryProducts = products.filter((product) => product.category === category)
      const totalStock = categoryProducts.reduce((sum, product) => sum + product.currentStock, 0)
      const lowStock = categoryProducts.filter((product) => product.currentStock <= product.minimumStock).length
      const examples = categoryProducts.slice(0, 2).map((product) => product.name).join(', ')
      const description = `${examples || 'No products'} · ${totalStock} units in stock · ${lowStock} low-stock item${lowStock === 1 ? '' : 's'}`
      card.dataset.description = description
      card.tabIndex = 0
      card.setAttribute('aria-label', `${category}. ${description}`)
    })
  }, [section, products, categories])

  return <section className="inventory-operations"><div className="products-toolbar"><div><p className="dashboard-kicker">Inventory / {section}</p><h2>{section}</h2><p className="products-count">Business data for {business.name}</p></div>{!operation && <div className="business-filter">{business.currency} · {business.industry}</div>}</div>{operation ? <><form className="stock-operation-form" onSubmit={handleStockSubmit}><div><label htmlFor="stock-product">Product *</label><select id="stock-product" name="productId" defaultValue="" required><option value="" disabled>Select a product</option>{products.map((product) => <option key={product.productId} value={product.productId}>{product.name} ({product.sku})</option>)}</select></div><div><label htmlFor="stock-quantity">{section === 'Adjustments' ? 'New stock quantity *' : 'Quantity *'}</label><input id="stock-quantity" name="quantity" type="number" min="0" step="1" required /></div><div><label htmlFor="stock-reason">Reason</label><input id="stock-reason" name="reason" placeholder={section === 'Stock In' ? 'Purchase or return' : section === 'Stock Out' ? 'Sale or damage' : 'Correction reason'} /></div><button className="submit-button" type="submit" disabled={saving}>{saving ? 'Recording…' : `Record ${section.toLowerCase()}`} <span>→</span></button></form>{message && <p className={`form-status ${message.type}`}>{message.text}</p>}<div className="section-heading operation-heading"><div><p className="dashboard-kicker">Current quantities</p><h2>Stock levels</h2></div><span className="business-filter">{products.length} products</span></div><AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!filteredProducts.length} emptyText="No products match your search."><StockTable products={filteredProducts} business={business} /></AsyncBoundary></> : section === 'Categories' ? <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!categories.length} emptyText="No categories yet. Add categories while creating products."><div className="category-grid">{categories.map((category) => <article className="category-card" key={category}><span className="category-mark">◫</span><strong>{category}</strong><small>{products.filter((product) => product.category === category).length} products</small></article>)}</div></AsyncBoundary> : section === 'Stock History' ? <><div className="products-controls"><div className="search-box"><span>⌕</span><input aria-label="Search stock history" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, type, or reason" /></div></div><AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!history.length} emptyText="No stock transactions recorded for this business."><div className="history-list">{history.map((item) => <div className="history-row" key={item.transactionId}><span className={`history-type ${item.type}`}>{item.type.replace('_', ' ')}</span><span><strong>{products.find((product) => product.productId === item.productId)?.name || item.productId}</strong><small>{item.reason} · {new Date(item.createdAt).toLocaleString()}</small></span><span className="history-quantity">{item.previousStock} → {item.newStock}</span></div>)}</div></AsyncBoundary></> : <><div className="products-controls"><div className="search-box"><span>⌕</span><input aria-label="Search stock" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products or SKU" /></div></div><AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!filteredProducts.length} emptyText="No products match your search."><StockTable products={filteredProducts} business={business} /></AsyncBoundary></>}</section>
}

function StockTable({ products, business }) {
  return <div className="products-table"><div className="product-table-row product-table-head"><span>Product</span><span>Category</span><span>Stock</span><span>Status</span></div>{products.map((product) => <div className="product-table-row" key={product.productId}><span className="product-cell"><span className="product-thumb">{product.name[0]}</span><span><strong>{product.name}</strong><small>{product.sku} · {product.unit}</small></span></span><span>{product.category}</span><span className={`product-stock ${product.currentStock <= product.minimumStock ? 'low' : ''}`}>{product.currentStock}</span><span className={`stock-badge ${product.currentStock === 0 ? 'empty' : product.currentStock <= product.minimumStock ? 'low' : ''}`}>{product.currentStock === 0 ? 'Out of stock' : product.currentStock <= product.minimumStock ? 'Low stock' : `In ${business.currency}`}</span></div>)}</div>
}

export default InventoryOperations
