import { useEffect, useMemo, useRef, useState } from 'react'
import AsyncBoundary from './AsyncBoundary.jsx'
import '../styles/categories.css'

function CatIcon({ name }) {
  const paths = {
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5M3 17l9 5 9-5" /></>,
    barcode: <><path d="M4 5v14M8 5v14M12 5v14M16 5v10M20 5v14" /></>,
    trend: <><path d="M4 17 10 11l4 4 6-7" /><path d="M15 8h5v5" /></>,
    alert: <><path d="M12 4 2 20h20L12 4Z" /><path d="M12 10v5M12 18h.01" /></>,
    export: <><path d="M12 3v12m-4-4 4 4 4-4" /><path d="M5 17v3h14v-3" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    grid: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></>,
    sort: <><path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" /></>,
    hierarchy: <><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M12 8v4M6 16v-2h12v2" /></>,
    folder: <path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const STATUS_LABEL = { critical: 'Out of stock', attention: 'Needs attention', healthy: 'Healthy' }
const TABS = [
  { id: 'all', label: 'All categories' },
  { id: 'healthy', label: 'Well stocked' },
  { id: 'attention', label: 'Needs attention' },
]
const SORTS = {
  count: { label: 'Products count', fn: (a, b) => b.count - a.count },
  value: { label: 'Stock value', fn: (a, b) => b.stockValue - a.stockValue },
  name: { label: 'Name (A–Z)', fn: (a, b) => a.category.localeCompare(b.category) },
  stock: { label: 'Units in stock', fn: (a, b) => b.totalStock - a.totalStock },
}
const SORT_ORDER = ['count', 'value', 'name', 'stock']
const REGION = {
  INR: 'ap-south-1 · Mumbai',
  USD: 'us-east-1 · N. Virginia',
  GBP: 'eu-west-2 · London',
  AUD: 'ap-southeast-2 · Sydney',
  EUR: 'eu-central-1 · Frankfurt',
}

export default function CategoriesView({ products, loading, error, refetch, business, onNavigate }) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all')
  const [view, setView] = useState('grid')
  const [sort, setSort] = useState('count')
  const [renderedAt] = useState(() => Date.now())
  const searchRef = useRef(null)

  const currency = business.currency || 'INR'
  const money = (value, dp = 0) => {
    const amount = Number(value || 0)
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: dp, maximumFractionDigits: dp }).format(amount)
    } catch {
      return `${currency} ${amount.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
    }
  }

  const categories = useMemo(() => [...new Set(products.map((product) => product.category).filter(Boolean))], [products])

  const stats = useMemo(() => categories.map((category) => {
    const items = products.filter((product) => product.category === category)
    const totalStock = items.reduce((sum, product) => sum + Number(product.currentStock || 0), 0)
    const stockValue = items.reduce((sum, product) => sum + Number(product.currentStock || 0) * Number(product.sellingPrice || 0), 0)
    const outOfStock = items.filter((product) => Number(product.currentStock || 0) <= 0).length
    const lowStock = items.filter((product) => Number(product.currentStock || 0) > 0 && Number(product.currentStock) <= Number(product.minimumStock || 0)).length
    const status = items.length > 0 && outOfStock === items.length ? 'critical' : outOfStock + lowStock > 0 ? 'attention' : 'healthy'
    const earliest = items.reduce((min, product) => !min || new Date(product.createdAt) < new Date(min) ? product.createdAt : min, null)
    const isNew = earliest ? renderedAt - new Date(earliest).getTime() < 30 * 24 * 60 * 60 * 1000 : false
    return { category, count: items.length, totalStock, stockValue, lowStock, outOfStock, status, isNew }
  }), [categories, products, renderedAt])

  const totalSkus = products.length
  const newThisMonth = stats.filter((stat) => stat.isNew).length
  const flagged = stats.filter((stat) => stat.status !== 'healthy')
  const wellStockedCount = stats.filter((stat) => stat.status === 'healthy').length
  const topValue = stats.reduce((max, stat) => !max || stat.stockValue > max.stockValue ? stat : max, null)
  const catalogValue = stats.reduce((sum, stat) => sum + stat.stockValue, 0)
  const avgItems = totalSkus / (categories.length || 1)

  const enriched = useMemo(() => {
    const maxValue = Math.max(1, ...stats.map((stat) => stat.stockValue))
    return stats.map((stat) => {
      let tagLabel = 'Well Stocked'
      let tagTone = 'green'
      if (stat.count > 0 && stat.outOfStock === stat.count) { tagLabel = 'Stock Depleted'; tagTone = 'rose' }
      else if (stat.lowStock + stat.outOfStock > 0) { tagLabel = `Low Stock (${stat.totalStock} left)`; tagTone = 'amber' }
      else if (topValue && stat.category === topValue.category) { tagLabel = 'Top Revenue'; tagTone = 'green' }
      else if (stat.count === 1) { tagLabel = 'Single Item'; tagTone = 'dim' }
      else if (stat.stockValue >= maxValue * 0.5) { tagLabel = 'High Value'; tagTone = 'green' }
      return { ...stat, tagLabel, tagTone, tone: stat.status === 'critical' ? 'critical' : stat.status === 'attention' ? 'attention' : 'ok' }
    })
  }, [stats, topValue])

  const filteredStats = useMemo(() => enriched
    .filter((stat) => tab === 'all' || (tab === 'healthy' && stat.status === 'healthy') || (tab === 'attention' && stat.status !== 'healthy'))
    .filter((stat) => stat.category.toLowerCase().includes(search.trim().toLowerCase()))
    .sort(SORTS[sort].fn), [enriched, tab, search, sort])

  const meters = {
    total: categories.length ? Math.round((wellStockedCount / categories.length) * 100) : 0,
    skus: Math.min(100, Math.round((avgItems / 40) * 100)),
    value: catalogValue ? Math.round(((topValue?.stockValue || 0) / catalogValue) * 100) : 0,
    attention: categories.length ? Math.round((flagged.length / categories.length) * 100) : 0,
  }

  const region = REGION[currency] || `${currency.toLowerCase()}-region`
  const sessionId = `#SKR-${String(business.businessId || 'LOCAL').slice(-4).toUpperCase()}`

  useEffect(() => {
    const handleShortcut = (event) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  const cycleSort = () => setSort(SORT_ORDER[(SORT_ORDER.indexOf(sort) + 1) % SORT_ORDER.length])

  const exportHierarchy = () => {
    const escapeCell = (value) => {
      const text = String(value ?? '')
      const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text
      return `"${safe.replaceAll('"', '""')}"`
    }
    const rows = [
      ['Category', 'Products', 'Total Units', 'Stock Value', 'Low Stock Items', 'Out Of Stock Items', 'Status'],
      ...enriched.map((stat) => [stat.category, stat.count, stat.totalStock, stat.stockValue, stat.lowStock, stat.outOfStock, STATUS_LABEL[stat.status]]),
    ]
    const url = URL.createObjectURL(new Blob([rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `category-hierarchy-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const tabCount = (id) => id === 'all' ? stats.length : id === 'healthy' ? wellStockedCount : flagged.length

  return <section className="category-page" aria-labelledby="category-title">
    <header className="cat-heading">
      <div>
        <p className="cat-kicker">Manage your categories <span>•</span> Inventory taxonomy</p>
        <h1 id="category-title">Categories</h1>
        <p>Catalog hierarchy, SKU distribution, and category-level stock health for <strong>{business.name}</strong>.</p>
      </div>
      <div className="cat-heading-actions">
        <button type="button" onClick={exportHierarchy} disabled={loading || !!error || !stats.length}><CatIcon name="export" />Export Hierarchy (CSV)</button>
        <button type="button" className="primary" onClick={() => onNavigate?.('Products')}><CatIcon name="plus" />Add New Category</button>
      </div>
    </header>

    <div className="cat-kpis" aria-label="Category summary" aria-busy={loading}>
      <article className="cat-kpi">
        <span>Total Categories <CatIcon name="layers" /></span>
        <strong>{loading || error ? '—' : categories.length}{newThisMonth > 0 && <em>+{newThisMonth} this month</em>}</strong>
        <p>Across {business.name} catalog</p>
        <div className="cat-meter"><i style={{ width: `${meters.total}%` }} /></div>
      </article>
      <article className="cat-kpi">
        <span>Catalogued SKUs <CatIcon name="barcode" /></span>
        <strong>{loading || error ? '—' : totalSkus}<em className="muted">active units</em></strong>
        <p>Avg {avgItems.toFixed(1)} items / category</p>
        <div className="cat-meter blue"><i style={{ width: `${meters.skus}%` }} /></div>
      </article>
      <article className="cat-kpi cat-kpi-value">
        <span>Highest Value Category <CatIcon name="trend" /></span>
        <strong className="cat-kpi-name">{loading || error ? '—' : topValue?.category || 'No data'}</strong>
        <p className="cat-kpi-money">{money(topValue?.stockValue || 0, 2)} landed valuation</p>
        <div className="cat-meter green"><i style={{ width: `${meters.value}%` }} /></div>
      </article>
      <article className={`cat-kpi${flagged.length ? ' cat-kpi-alert' : ''}`}>
        <span>Needs Attention <CatIcon name="alert" /></span>
        <strong>{loading || error ? '—' : flagged.length}{flagged.length > 0 && <em className="warn">Low Reorder</em>}</strong>
        <p>Categories below safety stock floor</p>
        <div className="cat-meter amber"><i style={{ width: `${meters.attention}%` }} /></div>
      </article>
    </div>

    <div className="cat-toolbar">
      <div className="cat-tabs" role="tablist">
        {TABS.map((option) => (
          <button type="button" key={option.id} role="tab" aria-selected={tab === option.id} className={tab === option.id ? 'active' : ''} onClick={() => setTab(option.id)}>
            {option.label}<b>{tabCount(option.id)}</b>
          </button>
        ))}
      </div>
      <label className="cat-search">
        <CatIcon name="search" />
        <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter categories by name or status" aria-label="Filter categories" />
        <kbd>Ctrl K</kbd>
      </label>
      <div className="cat-view" role="group" aria-label="Category layout">
        <button type="button" aria-pressed={view === 'grid'} aria-label="Grid view" onClick={() => setView('grid')}><CatIcon name="grid" /></button>
        <button type="button" aria-pressed={view === 'list'} aria-label="List view" onClick={() => setView('list')}><CatIcon name="list" /></button>
      </div>
      <button type="button" className="cat-sort" onClick={cycleSort}><CatIcon name="sort" />Sort: {SORTS[sort].label}</button>
    </div>

    <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!filteredStats.length} emptyText={stats.length ? 'No categories match this filter.' : 'No categories yet. Categories appear here once products are catalogued.'}>
      <div className={`cat-grid${view === 'list' ? ' is-list' : ''}`}>
        {filteredStats.map((stat) => (
          <article className={`cat-card tone-${stat.tone}`} key={stat.category} tabIndex={0}>
            <div className="cat-card-head">
              <span className="cat-card-icon"><CatIcon name={stat.tone === 'ok' ? 'folder' : 'alert'} /></span>
              <div className="cat-card-id">
                <strong>{stat.category}</strong>
                <small>{stat.count} product{stat.count === 1 ? '' : 's'}</small>
              </div>
              <button type="button" className="cat-card-menu" aria-label={`Open ${stat.category} in Products Catalog`} onClick={() => onNavigate?.('Products')}>⋮</button>
            </div>
            <div className="cat-card-foot">
              <span className={`cat-tag ${stat.tagTone}`}><i />{stat.tagLabel}</span>
              <b>{money(stat.stockValue)}</b>
            </div>
          </article>
        ))}
      </div>
    </AsyncBoundary>

    <div className="cat-hierarchy">
      <span className="cat-hierarchy-mark"><CatIcon name="hierarchy" /></span>
      <div>
        <strong>Multi-level inventory hierarchy</strong>
        <p>Categories, sub-categories, and tax classes are defined on each product record in your catalog.</p>
      </div>
      <div className="cat-hierarchy-actions">
        <button type="button" onClick={() => onNavigate?.('Settings')}>Manage tax classes</button>
        <button type="button" className="primary" onClick={() => onNavigate?.('Products')}>Open Products Catalog</button>
      </div>
    </div>

    <div className="cat-statusbar">
      <span><i />Catalog node · {region}</span>
      <span>Active Categories: {filteredStats.length} / {categories.length} Loaded</span>
      <span>Session {sessionId}</span>
      <span className="cat-statusbar-suite">Stockroom Enterprise Suite</span>
    </div>
  </section>
}
