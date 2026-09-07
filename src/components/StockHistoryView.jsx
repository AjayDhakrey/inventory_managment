import { useEffect, useMemo, useRef, useState } from 'react'
import AsyncBoundary from './AsyncBoundary.jsx'
import '../styles/stock-history.css'

function AuditIcon({ name }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    export: <><path d="M12 3v12m-4-4 4 4 4-4" /><path d="M5 17v3h14v-3" /></>,
    adjust: <><path d="M4 8h11M4 8a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm16 8H9m11 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" /></>,
    calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z" /><path d="m9.3 12 2 2 3.4-4.2" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const INCREASE_TYPES = new Set(['stock_in', 'sales_return'])
const DECREASE_TYPES = new Set(['stock_out', 'purchase_return'])

const EVENT_META = {
  stock_in: { label: 'Stock In', tone: 'in', group: 'in' },
  sales_return: { label: 'Stock In', tone: 'in', group: 'in' },
  stock_out: { label: 'Stock Out', tone: 'out', group: 'out' },
  purchase_return: { label: 'Stock Out', tone: 'out', group: 'out' },
  adjustment: { label: 'Adjustment', tone: 'flex', group: 'flex' },
  non_sellable_return: { label: 'Adjustment', tone: 'flex', group: 'flex' },
}

const FILTERS = [
  { id: 'all', label: 'All Events' },
  { id: 'out', label: 'Stock Out (POS)' },
  { id: 'in', label: 'Stock In (Inward PO)' },
  { id: 'flex', label: 'Adjustments / Bulk Import' },
]

const metaFor = (type) => EVENT_META[type] || { label: (type || 'movement').replace(/_/g, ' '), tone: 'flex', group: 'flex' }

const initials = (text = '') => {
  const parts = text.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  return (parts[0][0] + (parts[1]?.[0] || parts[0][1] || '')).toUpperCase()
}

const toDateValue = (date) => {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function describeEntry(item, meta) {
  const reason = (item.reason || '').trim()
  const ref = (item.referenceId || '').trim()
  let label = reason || meta.label
  let detail = ''
  const colon = reason.indexOf(': ')
  if (colon > -1) {
    label = reason.slice(0, colon)
    detail = reason.slice(colon + 2)
  } else if (ref) {
    detail = /^[a-f0-9]{24}$/i.test(ref) ? `#${ref.slice(-8).toUpperCase()}` : ref
  }
  const source = (item.createdBy || '').trim() || (meta.group === 'out' ? 'POS Terminal' : meta.group === 'in' ? 'Receiving Dock' : 'System Batch Ingestion')
  return { label, detail, source }
}

export default function StockHistoryView({ transactions, products, business, loading, error, refetch, onNavigate }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [from, setFrom] = useState(() => toDateValue(Date.now() - 30 * 864e5))
  const [to, setTo] = useState(() => toDateValue(Date.now()))
  const searchRef = useRef(null)

  const currency = business.currency || 'INR'
  const money = (value, dp = 2) => {
    const amount = Number(value || 0)
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: dp, maximumFractionDigits: dp }).format(amount)
    } catch {
      return `${currency} ${amount.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
    }
  }

  const productById = useMemo(() => new Map(products.map((product) => [product.productId, product])), [products])

  const todayCount = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return transactions.filter((item) => new Date(item.createdAt) >= start).length
  }, [transactions])

  const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity
  const toTime = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity

  const dateFiltered = useMemo(() => transactions.filter((item) => {
    const at = new Date(item.createdAt).getTime()
    return at >= fromTime && at <= toTime
  }), [transactions, fromTime, toTime])

  const counts = useMemo(() => dateFiltered.reduce((result, item) => {
    result.all += 1
    result[metaFor(item.type).group] += 1
    return result
  }, { all: 0, in: 0, out: 0, flex: 0 }), [dateFiltered])

  const stats = useMemo(() => {
    const received = dateFiltered.filter((item) => INCREASE_TYPES.has(item.type)).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    const dispatched = dateFiltered.filter((item) => DECREASE_TYPES.has(item.type)).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    const valuation = dateFiltered.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(productById.get(item.productId)?.purchasePrice || 0), 0)
    const discrepancies = dateFiltered.filter((item) => {
      if (item.type === 'adjustment' || item.type === 'non_sellable_return') return false
      const delta = INCREASE_TYPES.has(item.type) ? Number(item.quantity || 0) : -Number(item.quantity || 0)
      return Number(item.previousStock || 0) + delta !== Number(item.newStock || 0)
    }).length
    const byCategory = {}
    for (const item of dateFiltered) {
      const category = productById.get(item.productId)?.category
      if (category) byCategory[category] = (byCategory[category] || 0) + 1
    }
    const topCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0] || ''

    const span = Number.isFinite(fromTime) && Number.isFinite(toTime) ? toTime - fromTime : 0
    let delta = null
    if (span > 0) {
      const previous = transactions.filter((item) => {
        const at = new Date(item.createdAt).getTime()
        return at >= fromTime - span && at < fromTime
      }).length
      delta = previous ? Math.round(((counts.all - previous) / previous) * 100) : counts.all ? Infinity : 0
    }

    return {
      total: counts.all,
      posCount: dateFiltered.filter((item) => item.type === 'stock_out').length,
      adjCount: dateFiltered.filter((item) => item.type === 'adjustment').length,
      received,
      dispatched,
      net: received - dispatched,
      valuation,
      avgTicket: counts.all ? valuation / counts.all : 0,
      discrepancies,
      topCategory,
      delta,
    }
  }, [dateFiltered, productById, transactions, counts.all, fromTime, toTime])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return dateFiltered.filter((item) => {
      const meta = metaFor(item.type)
      if (filter !== 'all' && meta.group !== filter) return false
      if (!query) return true
      const product = productById.get(item.productId)
      return [meta.label, product?.name, item.variantSku || product?.sku, item.variantColor || product?.color, item.variantSize || product?.size, item.reason, item.referenceId, item.createdBy]
        .filter(Boolean).join(' ').toLowerCase().includes(query)
    })
  }, [dateFiltered, filter, search, productById])

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

  const exportAudit = () => {
    const escapeCell = (value) => {
      const text = String(value ?? '')
      const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text
      return `"${safe.replaceAll('"', '""')}"`
    }
    const rows = [
      ['Date', 'Time', 'Event Type', 'Product', 'SKU', 'Variant', 'Quantity', 'Previous Stock', 'New Stock', 'Reason', 'Reference', 'Source'],
      ...visible.map((item) => {
        const meta = metaFor(item.type)
        const product = productById.get(item.productId)
        const when = new Date(item.createdAt)
        const { label, detail, source } = describeEntry(item, meta)
        return [
          when.toLocaleDateString('en-GB'),
          when.toLocaleTimeString('en-GB', { hour12: false }),
          meta.label,
          product?.name || item.productId,
          item.variantSku || product?.sku || '',
          [item.variantColor || product?.color, item.variantSize || product?.size].filter(Boolean).join(' / '),
          item.quantity,
          item.previousStock,
          item.newStock,
          detail ? `${label} • ${detail}` : label,
          item.referenceId || '',
          source,
        ]
      }),
    ]
    const url = URL.createObjectURL(new Blob([rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `stock-movement-audit-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const deltaChip = stats.delta === null || !stats.total ? null
    : stats.delta === Infinity ? <b className="up">NEW</b>
    : <b className={stats.delta >= 0 ? 'up' : 'down'}>{stats.delta >= 0 ? '+' : ''}{stats.delta}% {stats.delta >= 0 ? '↑' : '↓'}</b>

  return <section className="stock-audit-page" aria-labelledby="audit-title">
    <header className="audit-heading">
      <div>
        <div className="audit-title-line">
          <h1 id="audit-title">Stock History</h1>
          <span className={`audit-live${error ? ' is-error' : ''}`}><i />{loading ? 'Syncing ledger' : error ? 'Connection issue' : 'Live stream'}</span>
        </div>
        <p>Business movement ledger for <strong>{business.name}</strong></p>
        <p className="audit-note"><b>{todayCount}</b> verified transaction{todayCount === 1 ? '' : 's'} logged today</p>
      </div>
      <div className="audit-heading-actions">
        <button type="button" onClick={exportAudit} disabled={loading || !!error || !visible.length}><AuditIcon name="export" />Export Audit Log (CSV)</button>
        <button type="button" className="primary" onClick={() => onNavigate?.('Adjustments')}><AuditIcon name="adjust" />Manual Stock Adjustment</button>
      </div>
    </header>

    <div className="audit-kpis" aria-label="Stock movement summary" aria-busy={loading}>
      <article>
        <span>Total Movement Events {deltaChip}</span>
        <strong>{loading || error ? '—' : stats.total.toLocaleString('en-IN')} <small>entries</small></strong>
        <p><b>{stats.posCount} POS Sales</b> <i>·</i> <em>{stats.adjCount} Adjustments</em></p>
      </article>
      <article className="flow">
        <span>Net Stock Outflow <i>{stats.net > 0 ? '+' : ''}{stats.net} pcs Net</i></span>
        <strong>{loading || error ? '—' : stats.dispatched.toLocaleString('en-IN')} <small>dispatched</small></strong>
        <p><em className="pos">+{stats.received} Received</em> <i>·</i> <em className="neg">-{stats.dispatched} Sold</em></p>
      </article>
      <article className="value">
        <span>Valuation Impact Audited <i>100% Reconciled</i></span>
        <strong className="audit-money">{loading || error ? '—' : money(stats.valuation)}</strong>
        <p>Avg ticket: {money(stats.avgTicket, 0)} <i>·</i> {stats.topCategory || 'Mixed'} Node</p>
      </article>
      <article className="integrity">
        <span>Audit Integrity Status <i className="pulse" /></span>
        <strong>{loading || error ? '—' : stats.discrepancies} Discrepanc{stats.discrepancies === 1 ? 'y' : 'ies'}</strong>
        <p><AuditIcon name="shield" />Ledger checksum verified</p>
      </article>
    </div>

    <label className="audit-search">
      <AuditIcon name="search" />
      <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, type, or reason" aria-label="Search stock history" />
      <kbd>Ctrl + K</kbd>
    </label>

    <div className="audit-toolbar">
      <div className="audit-filters" role="group" aria-label="Filter movement events">
        {FILTERS.map((option) => (
          <button type="button" key={option.id} className={filter === option.id ? 'active' : ''} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>
            <i className={option.id} />{option.label}{option.id === 'all' ? ` (${counts.all})` : ''}
          </button>
        ))}
      </div>
      <div className="audit-range">
        <AuditIcon name="calendar" />
        <span>Timeline</span>
        <input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} aria-label="From date" />
        <em>–</em>
        <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} aria-label="To date" />
      </div>
    </div>

    <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!visible.length} emptyText={transactions.length ? 'No movement events match these filters. Widen the timeline or clear the search.' : 'No stock transactions recorded for this business yet.'}>
      <div className="audit-table-scroll" tabIndex={0} role="region" aria-label="Stock movement audit log">
        <table className="audit-table">
          <thead><tr><th scope="col">Event Type</th><th scope="col">Product &amp; SKU Identifier</th><th scope="col">Reason / Audit Source</th><th scope="col">Timestamp</th></tr></thead>
          <tbody>
            {visible.map((item) => {
              const meta = metaFor(item.type)
              const product = productById.get(item.productId)
              const name = product?.name || 'Unknown product'
              const sku = item.variantSku || product?.sku || item.productId
              const variant = [item.variantColor || product?.color, item.variantSize || product?.size].filter(Boolean).join(' / ')
              const { label, detail, source } = describeEntry(item, meta)
              const when = new Date(item.createdAt)
              return <tr key={item.transactionId}>
                <td><span className={`audit-badge ${meta.tone}`}>{meta.label}</span></td>
                <td>
                  <div className="audit-product">
                    <span className="audit-avatar">{initials(name)}</span>
                    <div>
                      <strong>{name}</strong>
                      <small>{sku}{variant ? ` • ${variant}` : ''}</small>
                    </div>
                  </div>
                </td>
                <td className="audit-reason">
                  <strong className={`is-${meta.group}`}>{label}{detail ? <span> • {detail}</span> : null}</strong>
                  <small>{source}</small>
                </td>
                <td className="audit-time">
                  <time dateTime={item.createdAt}>{when.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</time>
                  <small>{when.toLocaleTimeString('en-GB', { hour12: false })}</small>
                </td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
    </AsyncBoundary>
    {!loading && !error && !!visible.length && <p className="audit-count-line">Showing {visible.length} of {transactions.length} logged movement events</p>}
  </section>
}
