import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { purchaseOrderApi } from '../api/purchaseOrderApi.js'
import { productApi } from '../api/productApi.js'
import { supplierApi } from '../api/supplierApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'
import '../styles/purchase-orders.css'

const emptyLine = () => ({ productId: '', quantity: 1, purchasePrice: '', discount: 0, tax: 0 })

function PoIcon({ name }) {
  const paths = {
    export: <><path d="M12 3v12m-4-4 4 4 4-4" /><path d="M5 17v3h14v-3" /></>,
    recur: <><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8m0-4v4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16m0 4v-4h4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></>,
    grid: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>,
    truck: <><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17.5" cy="18" r="1.6" /></>,
    dock: <><path d="M4 20V9l8-5 8 5v11" /><path d="M9 20v-6h6v6" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.4 2.4 4.6-5" /></>,
    alert: <><path d="M12 4 2 20h20L12 4Z" /><path d="M12 10v5M12 18h.01" /></>,
    next: <path d="M5 12h13m-5-5 5 5-5 5" />,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const TABS = [
  { id: 'all', label: 'All Orders', match: () => true },
  { id: 'drafts', label: 'Drafts', match: (o) => o.status === 'Draft' },
  { id: 'pending', label: 'Pending Approval', match: (o) => o.status === 'Pending' || o.status === 'Approved' },
  { id: 'transit', label: 'In Transit / Due', match: (o) => o.status === 'Ordered' || o.status === 'Partially Received' },
  { id: 'closed', label: 'Received & Closed', match: (o) => o.status === 'Received' || o.status === 'Cancelled' },
]

const FULFILLMENT = {
  Draft: { label: 'Draft', tone: 'dim' },
  Pending: { label: 'Pending approval', tone: 'amber' },
  Approved: { label: 'Approved', tone: 'blue' },
  Ordered: { label: 'In transit', tone: 'blue' },
  'Partially Received': { label: 'Partially received', tone: 'amber' },
  Received: { label: 'Fully received', tone: 'green' },
  Cancelled: { label: 'Cancelled', tone: 'rose' },
}

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

function PurchaseOrders({ business, onNavigate }) {
  const load = useCallback(
    () => Promise.all([purchaseOrderApi.list(), productApi.list(), supplierApi.list({ status: 'active' })]),
    [],
  )
  const { data, loading, error, refetch, setData } = useResource(load, [], [[], [], []])
  const [orders, products, suppliers] = data

  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [menu, setMenu] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [viewingOrder, setViewingOrder] = useState(null)
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)
  const [lineItems, setLineItems] = useState([emptyLine()])
  const [nowTs] = useState(() => Date.now())
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
  const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.supplierId, supplier])), [suppliers])

  const setOrders = (updater) => setData((current) => [updater(current[0]), current[1], current[2]])
  const calculateItemTotal = (item) => { const base = Number(item.quantity || 0) * Number(item.purchasePrice || 0); return Math.max(0, base - Number(item.discount || 0) + Number(item.tax || 0)) }
  const updateLineItem = (index, field, value) => setLineItems(lineItems.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value, ...(field === 'productId' ? { purchasePrice: products.find((product) => product.productId === value)?.purchasePrice ?? '' } : {}) } : item))
  const openForm = (order = null) => { setEditingOrder(order); setLineItems(order ? order.items.map((item) => ({ productId: item.productId, quantity: item.quantity, purchasePrice: item.purchasePrice, discount: item.discount, tax: item.tax })) : [emptyLine()]); setFormOpen(true); setMessage(null); setMenu(null) }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    const formData = new FormData(event.currentTarget)
    if (!suppliers.length) { setMessage({ type: 'error', text: 'Add an active supplier before creating a purchase order.' }); return }
    const validItems = lineItems.filter((item) => item.productId && Number(item.quantity) > 0 && Number(item.purchasePrice) >= 0)
    if (!validItems.length) { setMessage({ type: 'error', text: 'Add at least one product with a valid quantity and price.' }); return }
    const payload = {
      supplierId: formData.get('supplierId'),
      expectedDeliveryDate: formData.get('expectedDeliveryDate'),
      shippingCharges: Number(formData.get('shippingCharges')) || 0,
      notes: formData.get('notes').trim(),
      items: validItems.map((item) => ({ productId: item.productId, quantity: Number(item.quantity), purchasePrice: Number(item.purchasePrice), discount: Number(item.discount || 0), tax: Number(item.tax || 0) })),
    }
    setSaving(true)
    try {
      const saved = editingOrder && editingOrder.purchaseOrderId
        ? await purchaseOrderApi.update(editingOrder.purchaseOrderId, payload)
        : await purchaseOrderApi.create(payload)
      setOrders((list) => (editingOrder && editingOrder.purchaseOrderId ? list.map((item) => (item.purchaseOrderId === saved.purchaseOrderId ? saved : item)) : [saved, ...list]))
      setFormOpen(false)
      setEditingOrder(null)
      setMessage({ type: 'success', text: `${saved.orderNumber} saved successfully.` })
      event.currentTarget.reset()
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not save the purchase order.' })
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (order, status) => {
    setMenu(null)
    try {
      const saved = await purchaseOrderApi.setStatus(order.purchaseOrderId, status)
      setOrders((list) => list.map((item) => (item.purchaseOrderId === saved.purchaseOrderId ? saved : item)))
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not update the order.' })
    }
  }
  const duplicateOrder = (order) => openForm({ ...order, purchaseOrderId: null, orderNumber: null, status: 'Draft', paymentStatus: 'Unpaid' })

  const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : null
  const toTime = to ? new Date(`${to}T23:59:59.999`).getTime() : null

  const tabCounts = useMemo(() => {
    const result = {}
    for (const { id, match } of TABS) result[id] = orders.filter(match).length
    return result
  }, [orders])

  const stats = useMemo(() => {
    const today = startOfToday()
    const weekAgo = nowTs - 7 * 864e5
    const active = orders.filter((order) => order.status !== 'Cancelled')
    const awaiting = orders.filter((order) => ['Approved', 'Ordered', 'Partially Received'].includes(order.status))
    const overdue = awaiting.filter((order) => order.expectedDeliveryDate && new Date(order.expectedDeliveryDate) < today)
    const received = orders.filter((order) => order.status === 'Received')
    const onTime = received.filter((order) => !order.expectedDeliveryDate || new Date(order.updatedAt) <= new Date(`${order.expectedDeliveryDate}T23:59:59`))
    const avgLead = received.length
      ? received.reduce((sum, order) => sum + Math.max(0, (new Date(order.updatedAt) - new Date(order.createdAt)) / 864e5), 0) / received.length
      : 0
    const cycleMs = 30 * 864e5
    const thisCycle = active.filter((order) => nowTs - new Date(order.createdAt).getTime() <= cycleMs).reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)
    const prevCycle = active.filter((order) => {
      const age = nowTs - new Date(order.createdAt).getTime()
      return age > cycleMs && age <= cycleMs * 2
    }).reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)
    return {
      total: orders.length,
      newThisWeek: orders.filter((order) => new Date(order.createdAt).getTime() >= weekAgo).length,
      inTransit: orders.filter((order) => ['Ordered', 'Partially Received'].includes(order.status)).length,
      pendingApproval: orders.filter((order) => ['Draft', 'Pending'].includes(order.status)).length,
      delivered: received.length,
      committedValue: active.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
      supplierCount: new Set(active.map((order) => order.supplierId)).size,
      cycleDelta: prevCycle ? Math.round(((thisCycle - prevCycle) / prevCycle) * 100) : null,
      awaiting: awaiting.length,
      overdue: overdue.length,
      slaPct: received.length ? Math.round((onTime.length / received.length) * 100) : 100,
      avgLead,
    }
  }, [orders, nowTs])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const matchTab = TABS.find((option) => option.id === tab)?.match || (() => true)
    return orders.filter((order) => {
      if (!matchTab(order)) return false
      if (supplierFilter !== 'all' && order.supplierId !== supplierFilter) return false
      if (paymentFilter !== 'all' && order.paymentStatus !== paymentFilter) return false
      const created = new Date(order.createdAt).getTime()
      if (fromTime && created < fromTime) return false
      if (toTime && created > toTime) return false
      if (query && !`${order.orderNumber} ${order.supplierName} ${order.status} ${order.items.map((item) => item.productName).join(' ')}`.toLowerCase().includes(query)) return false
      return true
    })
  }, [orders, tab, supplierFilter, paymentFilter, fromTime, toTime, search])

  const resetTo = (setter) => (value) => { setter(value); setPage(1) }

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)

  useEffect(() => {
    const handler = (event) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      } else if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        openForm()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!menu) return undefined
    const close = () => setMenu(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [menu])

  const etaInfo = (order) => {
    if (order.status === 'Received') return { text: 'Delivered', tone: 'green' }
    if (order.status === 'Cancelled') return { text: 'Cancelled', tone: 'dim' }
    const raw = order.expectedDeliveryDate
    if (!raw) return { text: 'No ETA set', tone: 'dim' }
    const target = new Date(`${raw}T00:00:00`)
    if (Number.isNaN(target.getTime())) return { text: 'No ETA set', tone: 'dim' }
    const diff = Math.round((target - startOfToday()) / 864e5)
    if (diff < 0) return { text: `Overdue ${Math.abs(diff)}d`, tone: 'rose' }
    if (diff === 0) return { text: 'ETA today', tone: 'amber' }
    if (diff === 1) return { text: 'ETA tomorrow', tone: 'amber' }
    return { text: `ETA ${target.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`, tone: 'muted' }
  }

  const settlement = (order) => {
    if (order.paymentStatus === 'Paid') return { label: 'Paid in full', tone: 'green' }
    if (order.paymentStatus === 'Partially Paid') return { label: 'Partial payment', tone: 'amber' }
    const terms = supplierById.get(order.supplierId)?.paymentTerms
    if (terms && terms !== 'Due on receipt') return { label: `${terms} terms`, tone: 'dim' }
    return { label: 'Unpaid', tone: 'rose' }
  }

  const poTag = (order, eta) => {
    if (order.status === 'Cancelled') return 'Cancelled order'
    if (eta.tone === 'rose') return 'SLA breach warning'
    if (order.status === 'Draft') return 'Draft — not sent'
    return order.createdBy ? `Raised by ${order.createdBy}` : 'Manual entry'
  }

  const primaryAction = (order) => {
    switch (order.status) {
      case 'Draft':
      case 'Pending': return { label: 'Approve PO', tone: 'amber', run: () => updateStatus(order, 'Approved') }
      case 'Approved': return { label: 'Mark ordered', tone: 'blue', run: () => updateStatus(order, 'Ordered') }
      case 'Ordered':
      case 'Partially Received': return { label: 'Receive inward', tone: 'orange', run: () => onNavigate?.('Receiving') }
      case 'Received': return { label: 'View GRN log', tone: 'ghost', run: () => onNavigate?.('Receiving') }
      default: return { label: 'Duplicate', tone: 'ghost', run: () => duplicateOrder(order) }
    }
  }

  const exportCsv = () => {
    const escapeCell = (value) => {
      const text = String(value ?? '')
      const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text
      return `"${safe.replaceAll('"', '""')}"`
    }
    const rows = [
      ['PO Number', 'Supplier', 'Status', 'Payment', 'Ordered', 'ETA', 'SKUs', 'Units', 'Committed Value', 'GST'],
      ...filtered.map((order) => [
        order.orderNumber,
        order.supplierName,
        order.status,
        order.paymentStatus,
        new Date(order.createdAt).toLocaleDateString('en-GB'),
        order.expectedDeliveryDate || '',
        order.items.length,
        order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        order.totalAmount,
        order.items.reduce((sum, item) => sum + Number(item.tax || 0), 0),
      ]),
    ]
    const url = URL.createObjectURL(new Blob([rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <section className="po-page" aria-labelledby="po-title">
    <header className="po-heading">
      <div>
        <p className="po-kicker">Manage your purchase orders <span>•</span> Procurement &amp; receiving</p>
        <h1 id="po-title">Purchase Orders</h1>
        <p>Track vendor commitments, lead times, inward shipments, and invoice settlements for <strong>{business.name}</strong>.</p>
      </div>
      <div className="po-heading-actions">
        <button type="button" onClick={exportCsv} disabled={loading || !!error || !orders.length}><PoIcon name="export" />Export POs (CSV)</button>
        <button type="button" onClick={() => (orders.length ? duplicateOrder(orders[0]) : openForm())}><PoIcon name="recur" />Generate Recurring PO</button>
        <button type="button" className="primary" onClick={() => openForm()}><PoIcon name="plus" />Create Purchase Order<kbd>Alt N</kbd></button>
      </div>
    </header>

    {message && <p className={`po-status-msg ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}

    <div className="po-flow" aria-label="How buying works">
      <p className="po-flow-title">How goods get from a supplier onto your shelves</p>
      <ol className="po-flow-steps">
        {[
          { label: 'Suppliers', blurb: 'The vendors you buy from.', nav: 'Suppliers' },
          { label: 'Purchase Order', blurb: 'You list what you want and agree a price.', nav: null },
          { label: 'Receiving', blurb: 'The delivery arrives — you count and check it.', nav: 'Receiving' },
          { label: 'Stock', blurb: 'Checked goods are added to inventory automatically.', nav: 'Stock' },
          { label: 'Sell', blurb: 'Items leave through POS or customer orders.', nav: 'POS / Billing' },
        ].map((step, index, all) => (
          <li key={step.label} className={step.nav ? 'link' : 'current'}>
            <button type="button" disabled={!step.nav} onClick={() => step.nav && onNavigate?.(step.nav)}>
              <span className="po-flow-index">{index + 1}</span>
              <strong>{step.label}{step.nav ? '' : ' · you are here'}</strong>
              <small>{step.blurb}</small>
            </button>
            {index < all.length - 1 && <span className="po-flow-arrow" aria-hidden="true"><PoIcon name="next" /></span>}
          </li>
        ))}
      </ol>
    </div>

    <div className="po-kpis" aria-busy={loading}>
      <article className="po-kpi">
        <span>Total Active POs <PoIcon name="list" /></span>
        <strong>{loading || error ? '—' : stats.total} <small>POs</small>{stats.newThisWeek > 0 && <em>+{stats.newThisWeek} this week</em>}</strong>
        <p>{stats.inTransit} In Transit · {stats.pendingApproval} Pending Approval · {stats.delivered} Delivered</p>
        <div className="po-meter blue"><i style={{ width: `${stats.total ? Math.round((stats.inTransit / stats.total) * 100) : 0}%` }} /></div>
      </article>
      <article className="po-kpi">
        <span>Committed Procurement Value <PoIcon name="check" /></span>
        <strong className="po-money">{loading || error ? '—' : money(stats.committedValue)}</strong>
        <p>{stats.cycleDelta === null ? 'First procurement cycle' : `${stats.cycleDelta >= 0 ? '+' : ''}${stats.cycleDelta}% vs last cycle`} · across {stats.supplierCount} supplier{stats.supplierCount === 1 ? '' : 's'}</p>
        <div className="po-meter green"><i style={{ width: `${stats.total ? Math.round(((stats.total - tabCounts.closed) / stats.total) * 100) : 0}%` }} /></div>
      </article>
      <article className={`po-kpi${stats.overdue ? ' po-kpi-alert' : ''}`}>
        <span>Pending Inward Receiving <PoIcon name="alert" /></span>
        <strong>{loading || error ? '—' : stats.awaiting} <small>Shipments</small>{stats.overdue > 0 && <em className="warn">{stats.overdue} Critical Overdue</em>}</strong>
        <p>Awaiting dock verification and GRN sign-off</p>
        <div className="po-meter amber"><i style={{ width: `${stats.awaiting ? Math.round((stats.overdue / stats.awaiting) * 100) : 0}%` }} /></div>
      </article>
      <article className="po-kpi">
        <span>Supplier Fulfillment SLA <PoIcon name="check" /></span>
        <strong className="po-good">{loading || error ? '—' : `${stats.slaPct}%`} <small>Avg lead {stats.avgLead.toFixed(1)}d</small></strong>
        <p>On-time delivery rate across received orders</p>
        <div className="po-meter green"><i style={{ width: `${stats.slaPct}%` }} /></div>
      </article>
    </div>

    <div className="po-toolbar">
      <div className="po-tabs" role="tablist">
        {TABS.map((option) => (
          <button type="button" key={option.id} role="tab" aria-selected={tab === option.id} className={tab === option.id ? 'active' : ''} onClick={() => resetTo(setTab)(option.id)}>
            {option.label}<b>{tabCounts[option.id]}</b>
          </button>
        ))}
      </div>
    </div>

    <div className="po-filters">
      <label className="po-search">
        <PoIcon name="search" />
        <input ref={searchRef} value={search} onChange={(event) => resetTo(setSearch)(event.target.value)} placeholder="Filter by PO number, supplier name, or item SKU" aria-label="Filter purchase orders" />
        <kbd>Ctrl K</kbd>
      </label>
      <select value={supplierFilter} onChange={(event) => resetTo(setSupplierFilter)(event.target.value)} aria-label="Filter by supplier">
        <option value="all">All suppliers ({suppliers.length} active)</option>
        {suppliers.map((supplier) => <option key={supplier.supplierId} value={supplier.supplierId}>{supplier.supplierName}</option>)}
      </select>
      <select value={paymentFilter} onChange={(event) => resetTo(setPaymentFilter)(event.target.value)} aria-label="Filter by payment status">
        <option value="all">All payment statuses</option>
        {['Unpaid', 'Partially Paid', 'Paid'].map((status) => <option key={status} value={status}>{status}</option>)}
      </select>
      <div className="po-range">
        <PoIcon name="calendar" />
        <input type="date" value={from} max={to || undefined} onChange={(event) => resetTo(setFrom)(event.target.value)} aria-label="From date" />
        <em>–</em>
        <input type="date" value={to} min={from || undefined} onChange={(event) => resetTo(setTo)(event.target.value)} aria-label="To date" />
      </div>
    </div>

    {formOpen && <form className="purchase-order-form" onSubmit={handleSubmit}>
      <div className="product-form-heading">
        <div><p className="dashboard-kicker">{editingOrder && editingOrder.purchaseOrderId ? 'Update order' : 'New purchase order'}</p><h3>{editingOrder && editingOrder.orderNumber ? `Edit ${editingOrder.orderNumber}` : 'Create purchase order'}</h3></div>
        <button type="button" className="close-button" onClick={() => setFormOpen(false)} aria-label="Close form">×</button>
      </div>
      <div className="purchase-order-fields">
        <div><label htmlFor="po-supplier">Supplier *</label><select id="po-supplier" name="supplierId" defaultValue={editingOrder?.supplierId || ''} required><option value="" disabled>Select supplier</option>{suppliers.map((supplier) => <option key={supplier.supplierId} value={supplier.supplierId}>{supplier.supplierName}</option>)}</select></div>
        <div><label htmlFor="po-delivery">Expected delivery</label><input id="po-delivery" name="expectedDeliveryDate" type="date" defaultValue={editingOrder?.expectedDeliveryDate || ''} /></div>
        <div><label htmlFor="po-shipping">Shipping / other charges</label><input id="po-shipping" name="shippingCharges" type="number" min="0" step="0.01" defaultValue={editingOrder?.shippingCharges || 0} /></div>
      </div>
      <div className="order-items-heading"><h4>Order items</h4><button type="button" className="outline-button" onClick={() => setLineItems([...lineItems, emptyLine()])}>Add item <span>+</span></button></div>
      <div className="order-items">{lineItems.map((item, index) => <div className="order-item-row" key={`${index}-${item.productId}`}><select aria-label="Select product" value={item.productId} onChange={(event) => updateLineItem(index, 'productId', event.target.value)} required><option value="">Select product</option>{products.map((product) => <option key={product.productId} value={product.productId}>{product.name} ({product.sku})</option>)}</select><input aria-label="Quantity" type="number" min="1" value={item.quantity} onChange={(event) => updateLineItem(index, 'quantity', event.target.value)} placeholder="Qty" required /><input aria-label="Purchase price" type="number" min="0" step="0.01" value={item.purchasePrice} onChange={(event) => updateLineItem(index, 'purchasePrice', event.target.value)} placeholder="Price" required /><input aria-label="Discount" type="number" min="0" step="0.01" value={item.discount} onChange={(event) => updateLineItem(index, 'discount', event.target.value)} placeholder="Discount" /><input aria-label="Tax" type="number" min="0" step="0.01" value={item.tax} onChange={(event) => updateLineItem(index, 'tax', event.target.value)} placeholder="Tax" /><strong>{money(calculateItemTotal(item))}</strong>{lineItems.length > 1 && <button type="button" className="remove-item" onClick={() => setLineItems(lineItems.filter((_, itemIndex) => itemIndex !== index))}>×</button>}</div>)}</div>
      <label htmlFor="po-notes">Notes</label>
      <textarea id="po-notes" name="notes" defaultValue={editingOrder?.notes || ''} placeholder="Delivery or order notes" />
      <div className="product-form-actions"><button type="button" className="outline-button" onClick={() => setFormOpen(false)}>Cancel</button><button className="submit-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save order'} <span>→</span></button></div>
    </form>}

    <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!filtered.length} emptyText={orders.length ? 'No purchase orders match these filters.' : 'No purchase orders yet. Create one to start tracking vendor commitments.'}>
      <div className="po-table-scroll" tabIndex={0} role="region" aria-label="Purchase orders">
        <table className="po-table">
          <thead><tr>
            <th>PO Identifier</th><th>Supplier &amp; Contact</th><th>Timeline / ETA</th><th>Items / SKUs</th>
            <th className="num">Committed Value</th><th>Settlement</th><th>Fulfillment Status</th><th className="num">Actions</th>
          </tr></thead>
          <tbody>
            {pageRows.map((order) => {
              const supplier = supplierById.get(order.supplierId)
              const eta = etaInfo(order)
              const pay = settlement(order)
              const fulfil = FULFILLMENT[order.status] || { label: order.status, tone: 'dim' }
              const units = order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
              const gst = order.items.reduce((sum, item) => sum + Number(item.tax || 0), 0)
              const skuNames = order.items.map((item) => item.productName).filter(Boolean).slice(0, 3).join(', ')
              const action = primaryAction(order)
              return <tr key={order.purchaseOrderId}>
                <td>
                  <div className="po-id"><span className={`po-dot ${fulfil.tone}`} />
                    <div><strong>{order.orderNumber}</strong><small>{poTag(order, eta)}</small></div>
                  </div>
                </td>
                <td>
                  <strong className="po-supplier">{order.supplierName}</strong>
                  <small>{[supplier?.contactPerson, supplier?.phone].filter(Boolean).join(' · ') || supplier?.email || 'No contact on file'}</small>
                </td>
                <td className="po-timeline">
                  <span>Ordered {new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                  <small className={`po-eta ${eta.tone}`}>{eta.text}</small>
                </td>
                <td>
                  <strong>{units.toLocaleString('en-IN')} units</strong>
                  <small>{order.items.length} SKU{order.items.length === 1 ? '' : 's'}{skuNames ? `: ${skuNames}` : ''}</small>
                </td>
                <td className="num po-value">
                  <strong>{money(order.totalAmount)}</strong>
                  <small>GST {money(gst)}</small>
                </td>
                <td><span className={`po-badge ${pay.tone}`}>{pay.label}</span></td>
                <td><span className={`po-badge ${fulfil.tone}`}><i />{fulfil.label}</span></td>
                <td className="num">
                  <div className="po-row-actions">
                    <button type="button" className={`po-action ${action.tone}`} onClick={action.run}>{action.label}</button>
                    <button type="button" className="po-menu-btn" aria-label={`More actions for ${order.orderNumber}`} aria-expanded={menu?.id === order.purchaseOrderId} onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      setMenu((current) => current?.id === order.purchaseOrderId ? null : { id: order.purchaseOrderId, order, x: rect.right, y: rect.bottom + 4 })
                    }}>⋮</button>
                  </div>
                </td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
      <footer className="po-pagination">
        <span>Showing {(currentPage - 1) * rowsPerPage + 1}–{Math.min(currentPage * rowsPerPage, filtered.length)} of {filtered.length} purchase orders</span>
        <div className="po-pagination-controls">
          <label>Rows
            <select value={rowsPerPage} onChange={(event) => { setRowsPerPage(Number(event.target.value)); setPage(1) }}>
              {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
          <span>{currentPage} / {totalPages}</span>
          <button type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
        </div>
      </footer>
    </AsyncBoundary>

    {menu && <>
      <div className="po-menu-backdrop" role="presentation" onClick={() => setMenu(null)} />
      <div className="po-menu" role="menu" style={{ top: menu.y, left: menu.x, transform: 'translateX(-100%)' }}>
        <button type="button" role="menuitem" onClick={() => { setViewingOrder(menu.order); setMenu(null) }}>View details</button>
        <button type="button" role="menuitem" onClick={() => openForm(menu.order)}>Edit order</button>
        <button type="button" role="menuitem" onClick={() => duplicateOrder(menu.order)}>Duplicate</button>
        {!['Received', 'Cancelled'].includes(menu.order.status) && <button type="button" role="menuitem" className="danger" onClick={() => updateStatus(menu.order, 'Cancelled')}>Cancel order</button>}
      </div>
    </>}

    <div className="po-statusbar">
      <span><i />Stockroom · Procurement gateway</span>
      <span>Node {business.currency === 'INR' ? 'ap-south-1 · Mumbai' : 'workspace region'}</span>
      <span>{stats.supplierCount} vendors linked</span>
      <span className="po-statusbar-suite">Enterprise Warehousing OS</span>
    </div>

    {viewingOrder && <div className="supplier-modal-backdrop" role="presentation" onClick={() => setViewingOrder(null)}>
      <article className="supplier-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="product-form-heading">
          <div><p className="dashboard-kicker">Purchase order details</p><h3>{viewingOrder.orderNumber}</h3></div>
          <button type="button" className="close-button" onClick={() => setViewingOrder(null)} aria-label="Close purchase order">×</button>
        </div>
        <div className="supplier-detail-grid">
          <div><small>Supplier</small><strong>{viewingOrder.supplierName}</strong></div>
          <div><small>Status</small><strong>{viewingOrder.status} · {viewingOrder.paymentStatus}</strong></div>
          <div><small>Expected delivery</small><strong>{viewingOrder.expectedDeliveryDate || 'Not set'}</strong></div>
          <div><small>Total</small><strong>{money(viewingOrder.totalAmount)}</strong></div>
        </div>
        <div className="order-detail-items">{viewingOrder.items.map((item) => <div key={`${item.productId}-${item.variantSku || ''}`}><span>{item.productName} × {item.quantity}</span><strong>{money(item.total)}</strong></div>)}</div>
      </article>
    </div>}
  </section>
}

export default PurchaseOrders
