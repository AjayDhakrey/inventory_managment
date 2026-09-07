import { useEffect, useMemo, useRef, useState } from 'react'
import AsyncBoundary from './AsyncBoundary.jsx'
import '../styles/stock-in.css'

function InwardIcon({ name, ...props }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    import: <><path d="M7 17H5a3 3 0 0 1-.5-6A7.5 7.5 0 0 1 19 9a4 4 0 0 1 0 8h-2M12 21V10m-4 4 4-4 4 4" /></>,
    history: <><path d="M7 3h7l4 4v14H6V3h1Zm7 0v5h4M9 12h6M9 16h6" /></>,
    arrow: <path d="M4 12h15m-5-5 5 5-5 5" />,
    box: <><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 9 9-4M3 8l9 4v10M7.5 5.5l9 5" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>
}

export default function StockInView(props) {
  return <StockMovementView {...props} />
}

export function StockOutView(props) {
  return <StockMovementView {...props} outward />
}

function StockMovementView({ products, transactions, business, account, loading, error, refetch, saving, message, onSubmit, onNavigate, canNavigate, outward = false }) {
  const movementLabel = outward ? 'outward' : 'inward'
  const operationLabel = outward ? 'Record stock out' : 'Record stock in'
  const [recentOnly, setRecentOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const productRef = useRef(null)
  const quantityRef = useRef(null)
  const searchRef = useRef(null)
  const formRef = useRef(null)
  const selectedProduct = products.find((product) => product.productId === selectedId)
  const currency = business.currency || 'INR'
  const money = (value) => {
    const amount = Number(value || 0)
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount)
    } catch {
      return `${currency} ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
  }

  const summary = useMemo(() => {
    const inward = transactions.filter((item) => item.type === (outward ? 'stock_out' : 'stock_in'))
    const latest = new Map()
    for (const transaction of inward) {
      const previous = latest.get(transaction.productId)
      if (!previous || new Date(transaction.createdAt) > new Date(previous.createdAt)) latest.set(transaction.productId, transaction)
    }
    return {
      entries: inward,
      inwardCount: inward.length,
      inwardUnits: inward.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      lowCount: products.filter((item) => Number(item.currentStock) <= Number(item.minimumStock || 0)).length,
      categories: [...new Set(products.map((item) => item.category).filter(Boolean))].sort(),
      value: products.reduce((sum, item) => sum + Number(item.currentStock || 0) * Number(item.purchasePrice || 0), 0),
      latest,
    }
  }, [products, transactions, outward])

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return products.filter((product) => {
      const matches = [product.name, product.sku, product.barcode, product.category, product.size, product.color].filter(Boolean).join(' ').toLowerCase().includes(query)
      return matches && (!recentOnly || summary.latest.has(product.productId)) && (!category || product.category === category) && (!lowOnly || Number(product.currentStock) <= Number(product.minimumStock || 0))
    })
  }, [products, search, category, lowOnly, recentOnly, summary.latest])

  useEffect(() => {
    const handleShortcut = (event) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      } else if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === (outward ? 'o' : 'i')) {
        event.preventDefault()
        productRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [outward])

  const startInward = (product) => {
    if (saving) return
    setSelectedId(product.productId)
    productRef.current.value = product.productId
    formRef.current.scrollIntoView({ block: 'center', behavior: 'auto' })
    quantityRef.current.focus({ preventScroll: true })
  }

  const exportDispatches = () => {
    const escapeCell = (value) => {
      const text = String(value ?? '')
      const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text
      return `"${safe.replaceAll('"', '""')}"`
    }
    const rows = [['Date', 'Product', 'SKU', 'Quantity', 'Reason'], ...summary.entries.map((entry) => {
      const product = products.find((item) => item.productId === entry.productId)
      return [entry.createdAt, product?.name || entry.productId, entry.variantSku || product?.sku || '', entry.quantity, entry.reason]
    })]
    const url = URL.createObjectURL(new Blob([rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `recent-dispatches-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <section className={`stock-in-page${outward ? ' stock-out-page' : ''}`} aria-labelledby="stock-in-title">
    <header className="inward-heading">
      <div>
        <div className="inward-title-line"><h1 id="stock-in-title">{outward ? 'Stock Out / Outward Dispatch' : 'Stock In / Inward Receiving'}</h1><span className={`inward-live${error ? ' is-error' : ''}`}><i />{loading ? 'Connecting' : error ? 'Connection issue' : outward ? 'Dispatch bay active' : 'Dock active'}</span></div>
        <p>{outward ? 'Outward goods dispatch and stock deductions for' : 'Record incoming stock and keep your'} <strong>{business.name}</strong>{outward ? ' inventory.' : ' inventory up to date.'}</p>
      </div>
      <div className="inward-heading-actions">
        <button type="button" onClick={() => searchRef.current?.focus()}><InwardIcon name="search" />Find SKU / barcode</button>
        {!outward && canNavigate?.('Bulk Import') && <button type="button" onClick={() => onNavigate('Bulk Import')}><InwardIcon name="import" />Bulk CSV import</button>}
        {outward && <button type="button" onClick={exportDispatches} disabled={loading || !!error || !summary.entries.length}><InwardIcon name="history" />Dispatch history (CSV)</button>}
        {outward ? <button type="button" className="outward-recent-action" onClick={() => { setRecentOnly(true); setCategory(''); setLowOnly(false); setSearch(''); searchRef.current?.focus() }}><InwardIcon name="history" />Recent dispatches</button> : canNavigate?.('Stock History') && <button type="button" onClick={() => onNavigate('Stock History')}><InwardIcon name="history" />Stock history</button>}
      </div>
    </header>

    <div className="inward-kpis" aria-label={outward ? 'Stock dispatch summary' : 'Stock receiving summary'} aria-busy={loading}>
      <article className="inward-kpi-accent"><div><h2>{outward ? 'Recently dispatched' : 'Recent inward'}</h2><span className="inward-metric-tag green">{outward ? 'Stock out' : 'Stock in'}</span></div><strong>{loading || error ? '—' : summary.inwardUnits.toLocaleString('en-IN')} <small>units</small></strong><p>{loading || error ? 'Waiting for inventory data' : `Across ${summary.inwardCount} entries in recent history`}</p></article>
      <article><div><h2>Needs restocking</h2><span className="inward-metric-tag amber">Low stock</span></div><strong>{loading || error ? '—' : summary.lowCount} <small>products</small></strong><p>At or below the reorder threshold</p></article>
      <article><div><h2>Product catalog</h2><span className="inward-metric-tag blue">Live stock</span></div><strong>{loading || error ? '—' : products.length} <small>SKUs</small></strong><p>{loading || error ? 'Waiting for inventory data' : `Across ${summary.categories.length} categories in your workspace`}</p></article>
      <article><div><h2>Inventory value</h2><span className="inward-metric-tag green">Cost value</span></div><strong className="inward-money">{loading || error ? '—' : money(summary.value)}</strong><p>Current stock × recorded purchase cost</p></article>
    </div>

    <section className="inward-intake" aria-labelledby="inward-form-title">
      <div className="inward-intake-header"><div><span className="inward-orange-square" /><h2 id="inward-form-title">{operationLabel}</h2><span className="inward-terminal-label">{outward ? 'Outward goods dispatch terminal' : 'Fast intake terminal'}</span></div><kbd>Alt + {outward ? 'O' : 'I'}</kbd></div>
      <form ref={formRef} onSubmit={onSubmit} onReset={() => setSelectedId('')}>
        <div className="inward-form-grid">
          <div className="inward-field"><label htmlFor="stock-product">Product / SKU <b>*</b></label><select ref={productRef} id="stock-product" name="productId" defaultValue="" required disabled={saving} onChange={(event) => setSelectedId(event.target.value)}><option value="" disabled>Select a product…</option>{products.map((product) => <option key={product.productId} value={product.productId}>{product.name} ({product.sku})</option>)}</select></div>
          <div className="inward-field"><label htmlFor="stock-quantity">Quantity <b>*</b></label><div className="inward-quantity"><input ref={quantityRef} id="stock-quantity" name="quantity" type="number" min="0" step="1" required disabled={saving} placeholder="0" /><span>{selectedProduct?.unit || 'units'}</span></div></div>
          <div className="inward-field"><label htmlFor="stock-reason">Reason / {outward ? 'dispatch' : 'inward'} type</label><input id="stock-reason" name="reason" list="stock-in-reasons" placeholder={outward ? 'Sale or damage' : 'Purchase or return'} disabled={saving} /><datalist id="stock-in-reasons">{(outward ? ['Sale', 'Damage', 'Transfer dispatch', 'Internal use'] : ['Purchase', 'Customer return', 'Transfer receipt', 'Opening stock']).map((reason) => <option key={reason} value={reason} />)}</datalist></div>
          <button className="inward-submit" type="submit" disabled={saving}>{saving ? 'Recording…' : operationLabel}<InwardIcon name="arrow" /></button>
        </div>
        <dl className="inward-product-context">
          <div><dt>Product rack / bin</dt><dd>{selectedProduct ? selectedProduct.rackLocation || selectedProduct.warehouse || 'Not assigned' : 'Select a product to view its location'}</dd></div>
          <div><dt>Unit purchase cost ({currency})</dt><dd className="inward-mono">{selectedProduct ? money(selectedProduct.purchasePrice) : '—'}</dd></div>
          <div><dt>{outward ? 'Current operator' : 'Product supplier'}</dt><dd>{outward ? `${account?.name || account?.email || 'Current user'} (${account?.role || 'Team member'})` : selectedProduct ? selectedProduct.supplier || 'Not assigned' : 'Select a product to view its supplier'}</dd></div>
        </dl>
      </form>
      {message && <p className={`inward-form-status ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}
    </section>

    <section className="inward-stock-levels" aria-labelledby="inward-stock-title">
      <div className="inward-levels-heading"><div><h2 id="inward-stock-title">Stock levels <span>{products.length} products</span></h2><p>Current inventory balance and recent {movementLabel} activity</p></div><div className="inward-category-tabs" role="group" aria-label="Stock level filters"><button type="button" aria-pressed={!category && !lowOnly && !recentOnly} onClick={() => { setCategory(''); setLowOnly(false); setRecentOnly(false) }}>All ({products.length})</button><select aria-label={outward ? 'Filter stock-out category' : 'Filter stock-in category'} value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{summary.categories.map((item) => <option key={item}>{item}</option>)}</select><button type="button" className="inward-low-filter" aria-pressed={lowOnly} onClick={() => setLowOnly(!lowOnly)}><i />Low stock ({summary.lowCount})</button>{outward && <button type="button" className="outward-recent-filter" aria-pressed={recentOnly} onClick={() => setRecentOnly(!recentOnly)}>Recent outward ({summary.latest.size})</button>}</div></div>
      <div className="inward-search-row"><label className="inward-search"><InwardIcon name="search" /><input ref={searchRef} aria-label={`Search ${movementLabel} products`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, SKU, barcode, size…" /><kbd>Ctrl K</kbd></label><span>{visibleProducts.length} of {products.length} products</span></div>
      <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!visibleProducts.length} emptyText={products.length ? 'No products match these filters.' : `No products yet. Add products to start ${outward ? 'dispatching' : 'receiving'} stock.`}>
        <div className="inward-table-scroll" tabIndex={0} role="region" aria-label="Stock levels table">
          <table className="inward-table"><thead><tr><th scope="col">Product / SKU</th><th scope="col">Category</th><th scope="col">Available stock</th><th scope="col">Last {movementLabel}</th><th scope="col">Stock cost value</th><th scope="col">Quick action</th></tr></thead><tbody>{visibleProducts.map((product) => {
            const latest = summary.latest.get(product.productId)
            const low = Number(product.currentStock) <= Number(product.minimumStock || 0)
            return <tr key={product.productId}>
              <td><div className="inward-product"><span className={`inward-product-mark${low ? ' is-low' : ''}`}>{product.name?.[0] || <InwardIcon name="box" />}</span><div><strong>{product.name}</strong><small>{product.sku}{product.size ? ` · Size: ${product.size}` : ''}{product.color ? ` · ${product.color}` : ''}</small></div></div></td>
              <td><span className="inward-category-badge">{product.category}</span></td>
              <td><div className={`inward-stock${low ? ' is-low' : ''}`}><strong>{Number(product.currentStock || 0).toLocaleString('en-IN')}</strong><span>{product.unit}</span>{low && <em>Low</em>}</div></td>
              <td className="inward-last-entry">{latest ? <><time dateTime={latest.createdAt}>{new Date(latest.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time><small title={latest.reason}>{latest.reason || (outward ? 'Stock out' : 'Stock in')}</small></> : <span>No recent {movementLabel}</span>}</td>
              <td className="inward-row-value"><strong>{money(Number(product.currentStock || 0) * Number(product.purchasePrice || 0))}</strong><small>In {currency}</small></td>
              <td><button type="button" className={`inward-row-action${low ? ' is-low' : ''}`} disabled={saving} aria-label={`${outward ? 'Dispatch' : 'Add inward stock for'} ${product.name}`} onClick={() => startInward(product)}>{outward ? '− Dispatch' : `+ ${low ? 'Restock' : 'Inward'}`}</button></td>
            </tr>
          })}</tbody></table>
        </div>
      </AsyncBoundary>
    </section>
  </section>
}
