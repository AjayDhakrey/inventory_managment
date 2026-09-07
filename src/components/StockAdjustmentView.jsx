import { useEffect, useMemo, useRef, useState } from 'react'
import AsyncBoundary from './AsyncBoundary.jsx'
import '../styles/stock-adjustments.css'

function AdjustmentIcon({ name }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    export: <><path d="M12 3v12m-4-4 4 4 4-4" /><path d="M5 18v3h14v-3" /></>,
    log: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    arrow: <path d="M4 12h15m-5-5 5 5-5 5" />,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default function StockAdjustmentView({ products, transactions, business, account, loading, error, refetch, saving, message, onSubmit }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [recentOnly, setRecentOnly] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [newQuantity, setNewQuantity] = useState('')
  const productRef = useRef(null)
  const quantityRef = useRef(null)
  const searchRef = useRef(null)
  const formRef = useRef(null)
  const selectedProduct = products.find((product) => product.productId === selectedId)
  const currency = business.currency || 'INR'
  const formatMoney = (value) => {
    const amount = Number(value || 0)
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount)
    } catch {
      return `${currency} ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
  }

  const summary = useMemo(() => {
    const entries = transactions.filter((item) => item.type === 'adjustment')
    const latest = new Map()
    for (const entry of entries) {
      const previous = latest.get(entry.productId)
      if (!previous || new Date(entry.createdAt) > new Date(previous.createdAt)) latest.set(entry.productId, entry)
    }
    const netVariance = entries.reduce((sum, item) => sum + Number(item.newStock || 0) - Number(item.previousStock || 0), 0)
    const valueImpact = entries.reduce((sum, item) => {
      const product = products.find((candidate) => candidate.productId === item.productId)
      return sum + (Number(item.newStock || 0) - Number(item.previousStock || 0)) * Number(product?.purchasePrice || 0)
    }, 0)
    return {
      entries,
      latest,
      netVariance,
      valueImpact,
      categories: [...new Set(products.map((item) => item.category).filter(Boolean))].sort(),
      flaggedCount: products.filter((item) => Number(item.currentStock) <= Number(item.minimumStock || 0)).length,
    }
  }, [products, transactions])

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return products.filter((product) => {
      const matchesSearch = [product.name, product.sku, product.barcode, product.category, product.size, product.color].filter(Boolean).join(' ').toLowerCase().includes(query)
      return matchesSearch && (!category || product.category === category) && (!flaggedOnly || Number(product.currentStock) <= Number(product.minimumStock || 0)) && (!recentOnly || summary.latest.has(product.productId))
    })
  }, [products, search, category, flaggedOnly, recentOnly, summary.latest])

  useEffect(() => {
    const handleShortcut = (event) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      } else if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        productRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  const startAdjustment = (product) => {
    if (saving) return
    setSelectedId(product.productId)
    setNewQuantity(String(product.currentStock ?? 0))
    productRef.current.value = product.productId
    formRef.current.scrollIntoView({ block: 'center', behavior: 'auto' })
    quantityRef.current.focus({ preventScroll: true })
    quantityRef.current.select()
  }

  const exportAdjustments = () => {
    const escapeCell = (value) => {
      const text = String(value ?? '')
      const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text
      return `"${safe.replaceAll('"', '""')}"`
    }
    const rows = [['Date', 'Product', 'SKU', 'Previous Stock', 'New Stock', 'Variance', 'Reason'], ...summary.entries.map((entry) => {
      const product = products.find((item) => item.productId === entry.productId)
      return [entry.createdAt, product?.name || entry.productId, product?.sku || '', entry.previousStock, entry.newStock, Number(entry.newStock || 0) - Number(entry.previousStock || 0), entry.reason]
    })]
    const url = URL.createObjectURL(new Blob([rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `inventory-adjustments-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const selectedVariance = selectedProduct && newQuantity !== '' ? Number(newQuantity) - Number(selectedProduct.currentStock || 0) : null
  const resetFilters = () => { setCategory(''); setFlaggedOnly(false); setRecentOnly(false) }

  return <section className="stock-adjustment-page" aria-labelledby="adjustment-title">
    <header className="adjustment-heading">
      <div><p className="adjustment-kicker">Manage your adjustments <span>•</span> Business data for {business.name}</p><div className="adjustment-title-line"><h1 id="adjustment-title">Adjustments</h1><span>Live discrepancy reconciliation</span></div><p>Reconcile physical counts with digital ledger balances and keep a complete inventory audit trail.</p></div>
      <div className="adjustment-heading-actions"><button type="button" onClick={() => searchRef.current?.focus()}><AdjustmentIcon name="search" />Find product</button><button type="button" onClick={exportAdjustments} disabled={loading || !!error || !summary.entries.length}><AdjustmentIcon name="export" />Export CSV</button><button type="button" className="primary" onClick={() => { setRecentOnly(true); setCategory(''); setFlaggedOnly(false); setSearch(''); searchRef.current?.focus() }}><AdjustmentIcon name="log" />Recent log ({summary.entries.length})</button></div>
    </header>

    <div className="adjustment-kpis" aria-label="Inventory adjustment summary" aria-busy={loading}>
      <article><span>Recent adjustments <i>▣</i></span><strong>{loading || error ? '—' : summary.entries.length} <small>events logged</small></strong><p>Across {summary.latest.size} products in recent history</p></article>
      <article className="variance"><span>Net quantity variance <i>↕</i></span><strong>{loading || error ? '—' : `${summary.netVariance > 0 ? '+' : ''}${summary.netVariance}`} <small>units net difference</small></strong><p>Calculated from recorded adjustments</p></article>
      <article className="impact"><span>Estimated cost impact <i>₹</i></span><strong>{loading || error ? '—' : formatMoney(summary.valueImpact)}</strong><p>Variance × current purchase cost</p></article>
      <article className="review"><span>Products needing review <i>◇</i></span><strong>{loading || error ? '—' : summary.flaggedCount} <small>products</small></strong><p>At or below minimum stock</p></article>
    </div>

    <section className="adjustment-form-card" aria-labelledby="adjustment-form-title">
      <div className="adjustment-form-header"><div><span /><h2 id="adjustment-form-title">Record inventory adjustment</h2><p>Instant balance correction with an immutable audit trail</p></div><kbd>Alt + J</kbd></div>
      <form ref={formRef} onSubmit={onSubmit} onReset={() => { setSelectedId(''); setNewQuantity('') }}>
        <div className="adjustment-form-grid">
          <div className="adjustment-field"><label htmlFor="stock-product">Product / SKU <b>*</b></label><select ref={productRef} id="stock-product" name="productId" defaultValue="" required disabled={saving} onChange={(event) => { const id = event.target.value; const product = products.find((item) => item.productId === id); setSelectedId(id); setNewQuantity(product ? String(product.currentStock ?? 0) : '') }}><option value="" disabled>Select a product…</option>{products.map((product) => <option key={product.productId} value={product.productId}>{product.name} ({product.sku})</option>)}</select></div>
          <div className="adjustment-current"><label>Current stock</label><div><strong>{selectedProduct ? Number(selectedProduct.currentStock || 0).toLocaleString('en-IN') : '—'}</strong><span>{selectedProduct?.unit || 'units'}</span><em>Ledger</em></div></div>
          <div className="adjustment-field"><label htmlFor="stock-quantity">New quantity <b>*</b></label><div className="adjustment-new-quantity"><input ref={quantityRef} id="stock-quantity" name="quantity" type="number" min="0" step="1" value={newQuantity} onChange={(event) => setNewQuantity(event.target.value)} required disabled={saving} placeholder="0" />{selectedVariance !== null && <span className={selectedVariance < 0 ? 'negative' : ''}>{selectedVariance > 0 ? '+' : ''}{selectedVariance} {selectedProduct?.unit || 'units'}</span>}</div></div>
          <div className="adjustment-field"><label htmlFor="stock-reason">Reason / audit note</label><input id="stock-reason" name="reason" list="adjustment-reasons" placeholder="Physical count correction" disabled={saving} /><datalist id="adjustment-reasons">{['Physical count correction', 'Damaged stock', 'Shrinkage', 'Opening balance correction', 'Audit reconciliation'].map((reason) => <option key={reason} value={reason} />)}</datalist></div>
          <button className="adjustment-submit" type="submit" disabled={saving}>{saving ? 'Recording…' : 'Record adjustment'}<AdjustmentIcon name="arrow" /></button>
        </div>
        <div className="adjustment-form-context"><span>Rack / location: <strong>{selectedProduct ? selectedProduct.rackLocation || selectedProduct.warehouse || 'Not assigned' : 'Select a product'}</strong></span><span>Authorized by: <strong>{account?.name || account?.email || 'Current user'} ({account?.role || 'Team member'})</strong></span></div>
      </form>
      {message && <p className={`adjustment-form-status ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}
    </section>

    <section className="adjustment-levels" aria-labelledby="adjustment-stock-title">
      <div className="adjustment-levels-heading"><div><p>Current quantities</p><h2 id="adjustment-stock-title">Stock levels <span>{products.length} products</span></h2></div><div className="adjustment-tabs" role="group" aria-label="Adjustment stock filters"><button type="button" aria-pressed={!category && !flaggedOnly && !recentOnly} onClick={resetFilters}>All ({products.length})</button><select aria-label="Filter adjustment category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{summary.categories.map((item) => <option key={item}>{item}</option>)}</select><button type="button" className="flagged" aria-pressed={flaggedOnly} onClick={() => setFlaggedOnly(!flaggedOnly)}>Flagged ({summary.flaggedCount})</button><button type="button" aria-pressed={recentOnly} onClick={() => setRecentOnly(!recentOnly)}>Recent adjustments ({summary.latest.size})</button></div></div>
      <label className="adjustment-search"><AdjustmentIcon name="search" /><input ref={searchRef} aria-label="Search adjustment products" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, SKU, barcode, reason…" /><kbd>Ctrl K</kbd></label>
      <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!visibleProducts.length} emptyText={products.length ? 'No products match these filters.' : 'No products available for adjustment.'}>
        <div className="adjustment-table-scroll" tabIndex={0} role="region" aria-label="Adjustment stock levels table"><table className="adjustment-table"><thead><tr><th>Product / SKU</th><th>Category</th><th>Stock</th><th>Last adjustment</th><th>Cost valuation</th><th>Actions</th></tr></thead><tbody>{visibleProducts.map((product) => {
          const latest = summary.latest.get(product.productId)
          const variance = latest ? Number(latest.newStock || 0) - Number(latest.previousStock || 0) : 0
          return <tr key={product.productId}><td><div className="adjustment-product"><span>{product.name?.[0] || '?'}</span><div><strong>{product.name}</strong><small>{product.sku}{product.size ? ` · Size: ${product.size}` : ''}{product.color ? ` · ${product.color}` : ''}</small></div></div></td><td><strong>{product.category}</strong><small>{product.brand || 'General catalog'}</small></td><td><strong className={Number(product.currentStock) <= Number(product.minimumStock || 0) ? 'low' : ''}>{Number(product.currentStock || 0).toLocaleString('en-IN')}</strong> <small>{product.unit}</small></td><td className="adjustment-last">{latest ? <><time dateTime={latest.createdAt}>{new Date(latest.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time><small className={variance < 0 ? 'negative' : 'positive'}>{variance > 0 ? '+' : ''}{variance} · {latest.reason || 'Adjustment'}</small></> : <span>No recent adjustment</span>}</td><td><strong>{formatMoney(Number(product.currentStock || 0) * Number(product.purchasePrice || 0))}</strong><small>In {currency}</small></td><td><button type="button" onClick={() => startAdjustment(product)} disabled={saving}>Adjust</button></td></tr>
        })}</tbody></table></div>
      </AsyncBoundary>
    </section>
  </section>
}
