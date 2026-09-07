import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { salesOrderApi } from '../api/salesOrderApi.js'
import { productApi } from '../api/productApi.js'
import { customerApi } from '../api/customerApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'
import CreditSalesList from './CreditSalesList.jsx'
import OrderDetails from './OrderDetails.jsx'
import '../styles/sales-orders.css'

const emptyItem = () => ({ productId: '', quantity: 1, sellingPrice: '', discount: 0, tax: 0 })
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

function OrdIcon({ name }) {
  const paths = {
    print: <><path d="M7 8V3h10v5M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z" /></>,
    export: <><path d="M12 3v12m-4-4 4 4 4-4" /><path d="M5 17v3h14v-3" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    refresh: <><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8m0-4v4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16m0 4v-4h4" /></>,
    calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>,
    coin: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
    truck: <><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17.5" cy="18" r="1.6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8.4 12 2.4 2.4 4.8-5.4" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const TABS = [
  { id: 'all', label: 'All Orders', match: () => true },
  { id: 'processing', label: 'Processing', match: (o) => o.status !== 'Completed' && o.status !== 'Cancelled' && o.paymentStatus === 'Paid' },
  { id: 'pending', label: 'Pending Payment', match: (o) => o.status !== 'Completed' && o.status !== 'Cancelled' && o.paymentStatus !== 'Paid' },
  { id: 'completed', label: 'Completed', match: (o) => o.status === 'Completed' },
  { id: 'cancelled', label: 'Cancelled / Returns', match: (o) => o.status === 'Cancelled' },
]

const FULFILLMENT = (order) => {
  if (order.status === 'Completed') return { label: 'Completed · handed over', tone: 'green' }
  if (order.status === 'Cancelled') return { label: 'Cancelled', tone: 'rose' }
  if (order.paymentStatus === 'Paid') return { label: 'Ready to pack', tone: 'blue' }
  return { label: 'Awaiting payment', tone: 'amber' }
}

function SalesOrders({ business, creditSales = false, section = 'Credit Sales' }) {
  const load = useCallback(() => Promise.all([salesOrderApi.list(), productApi.list(), customerApi.list()]), [])
  const { data, loading, error, refetch, setData } = useResource(load, [], [[], [], []])
  const [orders, products, customers] = data

  const [formOpen, setFormOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [viewingOrder, setViewingOrder] = useState(null)
  const [items, setItems] = useState([emptyItem()])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all')
  const [channelFilter, setChannelFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)
  const [menu, setMenu] = useState(null)
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
  const customerById = useMemo(() => new Map(customers.map((customer) => [customer.customerId, customer])), [customers])

  const setOrders = (updater) => setData((current) => [updater(current[0]), current[1], current[2]])
  const itemTotal = (item) => Math.max(0, Number(item.quantity || 0) * Number(item.sellingPrice || 0) - Number(item.discount || 0) + Number(item.tax || 0))
  const totals = items.reduce((result, item) => ({ totalAmount: result.totalAmount + itemTotal(item) }), { totalAmount: 0 })
  const updateItem = (index, field, value) => setItems(items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value, ...(field === 'productId' ? { sellingPrice: products.find((product) => product.productId === value)?.sellingPrice ?? '' } : {}) } : item))
  const openForm = (order = null) => { setEditingOrder(order); setItems(order ? order.items.map((item) => ({ productId: item.productId, quantity: item.quantity, sellingPrice: item.sellingPrice, discount: item.discount, tax: item.tax })) : [emptyItem()]); setFormOpen(true); setMessage(null); setMenu(null) }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    if (!customers.length) { setMessage({ type: 'error', text: 'Add a customer before creating an order.' }); return }
    const formData = new FormData(event.currentTarget)
    const validItems = items.filter((item) => item.productId && Number(item.quantity) > 0 && Number(item.sellingPrice) >= 0)
    if (!validItems.length) { setMessage({ type: 'error', text: 'Add at least one product with a valid quantity and price.' }); return }
    const payload = {
      customerId: formData.get('customerId'),
      notes: formData.get('notes').trim(),
      items: validItems.map((item) => ({ productId: item.productId, quantity: Number(item.quantity), sellingPrice: Number(item.sellingPrice), discount: Number(item.discount || 0), tax: Number(item.tax || 0) })),
    }
    setSaving(true)
    try {
      const saved = editingOrder
        ? await salesOrderApi.update(editingOrder.orderId, payload)
        : await salesOrderApi.create(payload)
      setOrders((list) => (editingOrder ? list.map((item) => (item.orderId === saved.orderId ? saved : item)) : [saved, ...list]))
      setFormOpen(false)
      setEditingOrder(null)
      setMessage({ type: 'success', text: `${saved.orderNumber} saved successfully.` })
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not save the order.' })
    } finally {
      setSaving(false)
    }
  }

  const completeOrder = async (order) => {
    setMenu(null)
    if (order.status === 'Completed') return
    try {
      const saved = await salesOrderApi.complete(order.orderId)
      const freshProducts = await productApi.list()
      setData((current) => [current[0].map((item) => (item.orderId === saved.orderId ? saved : item)), freshProducts, current[2]])
      setMessage({ type: 'success', text: `${order.orderNumber} completed. Inventory was reduced.` })
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not complete the order.' })
    }
  }
  const cancelOrder = async (order) => {
    setMenu(null)
    if (order.status === 'Completed') return
    try {
      const saved = await salesOrderApi.cancel(order.orderId)
      setOrders((list) => list.map((item) => (item.orderId === saved.orderId ? saved : item)))
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not cancel the order.' })
    }
  }

  useEffect(() => {
    if (creditSales) return undefined
    const handler = (event) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key === '0') { event.preventDefault(); openForm() }
      else if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [creditSales])

  useEffect(() => {
    if (!menu) return undefined
    const close = () => setMenu(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [menu])

  const stats = useMemo(() => {
    const today = startOfToday()
    const yesterday = new Date(today.getTime() - 864e5)
    const active = orders.filter((order) => order.status !== 'Cancelled')
    const todays = active.filter((order) => new Date(order.createdAt) >= today)
    const yestSales = active.filter((order) => { const at = new Date(order.createdAt); return at >= yesterday && at < today }).reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)
    const todaySales = todays.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)
    const inFulfilment = orders.filter((order) => order.status === 'Pending' && order.paymentStatus === 'Paid')
    const fulfilUnits = inFulfilment.reduce((sum, order) => sum + order.items.reduce((n, item) => n + Number(item.quantity || 0), 0), 0)
    const awaiting = orders.filter((order) => order.status !== 'Cancelled' && Number(order.balanceDue || 0) > 0)
    const awaitingAmount = awaiting.reduce((sum, order) => sum + Number(order.balanceDue || 0), 0)
    const completed = orders.filter((order) => order.status === 'Completed').length
    const closeable = orders.filter((order) => order.status !== 'Cancelled').length
    return {
      todaySales,
      todayCount: todays.length,
      avgOrder: todays.length ? todaySales / todays.length : 0,
      salesDelta: yestSales ? Math.round(((todaySales - yestSales) / yestSales) * 100) : null,
      inFulfilment: inFulfilment.length,
      fulfilUnits,
      awaitingAmount,
      awaitingCount: awaiting.length,
      completed,
      fulfilRate: closeable ? Math.round((completed / closeable) * 100) : 100,
    }
  }, [orders])

  const tabCounts = useMemo(() => {
    const result = {}
    for (const { id, match } of TABS) result[id] = orders.filter(match).length
    return result
  }, [orders])

  const channels = [
    { id: 'all', label: 'All channels' },
    { id: 'pos', label: 'Retail POS counter' },
    { id: 'wholesale', label: 'Wholesale orders' },
    { id: 'order', label: 'Retail sales desk' },
  ]
  const channelOf = (order) => order.channel === 'POS' ? 'pos' : order.billingType === 'wholesale' ? 'wholesale' : 'order'

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase()
    const matchTab = TABS.find((option) => option.id === tab)?.match || (() => true)
    return orders.filter((order) => {
      if (!matchTab(order)) return false
      if (channelFilter !== 'all' && channelOf(order) !== channelFilter) return false
      if (statusFilter !== 'all' && order.status !== statusFilter) return false
      if (query && !`${order.orderNumber} ${order.invoiceNumber} ${order.customerName} ${order.status} ${order.items.map((item) => item.productName).join(' ')}`.toLowerCase().includes(query)) return false
      return true
    })
  }, [orders, tab, channelFilter, statusFilter, search])

  const exportCsv = () => {
    const escapeCell = (value) => {
      const text = String(value ?? '')
      const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text
      return `"${safe.replaceAll('"', '""')}"`
    }
    const rows = [
      ['Order', 'Invoice', 'Date', 'Customer', 'Channel', 'Items', 'Units', 'Grand Total', 'GST', 'Payment', 'Status'],
      ...visibleOrders.map((order) => [
        order.orderNumber, order.invoiceNumber, new Date(order.createdAt).toLocaleString('en-GB'), order.customerName,
        channelOf(order) === 'pos' ? 'Retail POS' : channelOf(order) === 'wholesale' ? 'Wholesale' : 'Retail order',
        order.items.length, order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        order.totalAmount, Number(order.cgst || 0) + Number(order.sgst || 0) + Number(order.igst || 0) || order.tax,
        order.paymentStatus, order.status,
      ]),
    ]
    const url = URL.createObjectURL(new Blob([rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `sales-orders-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const settlement = (order) => {
    const method = order.paymentSummary?.[0]?.method
    if (order.paymentStatus === 'Paid') return { label: method ? `Paid · ${method}` : 'Paid', tone: 'green' }
    if (order.paymentStatus === 'Partially Paid') return { label: 'Part-paid', tone: 'amber' }
    const terms = customerById.get(order.customerId)?.paymentTerms
    if (terms && terms !== 'Due on receipt') return { label: `Credit · ${terms}`, tone: 'amber' }
    return { label: 'Unpaid', tone: 'rose' }
  }

  if (creditSales) {
    return <section className="sales-orders-page">
      <CreditSalesList section={section} orders={orders} business={business} loading={loading} error={error} refetch={refetch} onCreate={() => openForm()} onView={setViewingOrder} onEdit={openForm} onComplete={completeOrder} onCancel={cancelOrder} />
      {message && <p className={`form-status ${message.type}`}>{message.text}</p>}
      {formOpen && <OrderFormModal {...{ creditSales, editingOrder, customers, products, items, setItems, emptyItem, updateItem, itemTotal, totals, business, saving, handleSubmit, onClose: () => setFormOpen(false) }} />}
      {viewingOrder && <OrderDetails order={viewingOrder} business={business} onClose={() => setViewingOrder(null)} />}
    </section>
  }

  return <section className="ord-page" aria-labelledby="ord-title">
    <header className="ord-heading">
      <div>
        <div className="ord-title-line">
          <h1 id="ord-title">Orders</h1>
          <span className="ord-scope">{business.name} · {business.industry || 'Retail'}</span>
        </div>
        <p>Manage customer sales, dispatch statuses, invoices, and point-of-sale receipts.</p>
        <p className="ord-note"><b>{stats.todayCount}</b> sales order{stats.todayCount === 1 ? '' : 's'} registered today</p>
      </div>
      <div className="ord-heading-actions">
        <button type="button" onClick={() => window.print()}><OrdIcon name="print" />Print slips</button>
        <button type="button" onClick={exportCsv} disabled={loading || !!error || !orders.length}><OrdIcon name="export" />Export CSV</button>
        <button type="button" className="primary" onClick={() => openForm()}><OrdIcon name="plus" />Create order<kbd>Alt 0</kbd></button>
      </div>
    </header>

    {message && <p className={`ord-message ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}

    <div className="ord-kpis" aria-busy={loading}>
      <article className="ord-kpi">
        <span>Today's total sales {stats.salesDelta !== null && <b className={stats.salesDelta >= 0 ? 'up' : 'down'}>{stats.salesDelta >= 0 ? '+' : ''}{stats.salesDelta}%</b>}</span>
        <strong className="ord-money">{loading || error ? '—' : money(stats.todaySales)}<em>{stats.todayCount} orders</em></strong>
        <p>Avg order value {money(stats.avgOrder, 0)}</p>
      </article>
      <article className="ord-kpi">
        <span>In fulfilment / dispatch <i className="blue">Active line</i></span>
        <strong>{loading || error ? '—' : stats.inFulfilment} <small>orders · {stats.fulfilUnits} units</small></strong>
        <p>Paid orders waiting to be packed &amp; dispatched</p>
      </article>
      <article className={`ord-kpi${stats.awaitingCount > 0 ? ' ord-kpi-alert' : ''}`}>
        <span>Awaiting payment {stats.awaitingCount > 0 && <i className="amber">Action req.</i>}</span>
        <strong className="ord-money">{loading || error ? '—' : money(stats.awaitingAmount)}<em>{stats.awaitingCount} orders</em></strong>
        <p>Unpaid balances across open credit invoices</p>
      </article>
      <article className="ord-kpi">
        <span>Fulfilment rate <i className="green">Target 95%</i></span>
        <strong className="ord-good">{loading || error ? '—' : `${stats.fulfilRate}%`} <small>{stats.completed} delivered</small></strong>
        <p>Completed orders as a share of all non-cancelled</p>
      </article>
    </div>

    <div className="ord-workflow">
      <span className="ord-workflow-mark"><OrdIcon name="check" /></span>
      <div>
        <strong>Sales pipeline</strong>
        <p>Orders reserve warehouse stock as soon as they're created. Completing an order deducts stock and generates the customer invoice.</p>
        <div className="ord-workflow-legend">
          <span><i className="green" />Completed = paid &amp; handed over</span>
          <span><i className="blue" />Processing = packing / dispatch</span>
          <span><i className="amber" />Pending = unpaid / on credit</span>
        </div>
      </div>
    </div>

    <div className="ord-toolbar">
      <div className="ord-tabs" role="tablist">
        {TABS.map((option) => (
          <button type="button" key={option.id} role="tab" aria-selected={tab === option.id} className={tab === option.id ? 'active' : ''} onClick={() => setTab(option.id)}>
            {option.label}<b>{tabCounts[option.id]}</b>
          </button>
        ))}
      </div>
      <div className="ord-toolbar-right">
        <button type="button" onClick={refetch}><OrdIcon name="refresh" />Refresh</button>
        <button type="button" onClick={exportCsv} disabled={!orders.length}><OrdIcon name="export" />Export CSV</button>
      </div>
    </div>

    <div className="ord-filters">
      <label className="ord-search">
        <OrdIcon name="search" />
        <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, invoice, customer, or item" aria-label="Search orders" />
        <kbd>Ctrl K</kbd>
      </label>
      <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} aria-label="Filter by channel">
        {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.label}</option>)}
      </select>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
        <option value="all">All statuses</option>
        {['Pending', 'Completed', 'Cancelled'].map((status) => <option key={status} value={status}>{status}</option>)}
      </select>
      <div className="ord-today"><OrdIcon name="calendar" />{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
    </div>

    {formOpen && <OrderFormModal {...{ creditSales, editingOrder, customers, products, items, setItems, emptyItem, updateItem, itemTotal, totals, business, saving, handleSubmit, onClose: () => setFormOpen(false) }} />}

    <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!visibleOrders.length} emptyText={orders.length ? 'No orders match these filters.' : 'No sales orders yet. Create one or ring up a sale at the POS.'}>
      <div className="ord-table-wrap">
        <div className="ord-table-scroll" tabIndex={0} role="region" aria-label="Sales orders">
          <table className="ord-table">
            <thead><tr>
              <th>Order # &amp; date</th><th>Customer &amp; contact</th><th>Sales channel</th><th>Purchased items</th>
              <th className="num">Grand total</th><th>Payment status</th><th>Fulfilment</th><th className="num">Actions</th>
            </tr></thead>
            <tbody>
              {visibleOrders.map((order) => {
                const customer = customerById.get(order.customerId)
                const units = order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
                const gst = Number(order.cgst || 0) + Number(order.sgst || 0) + Number(order.igst || 0) || Number(order.tax || 0)
                const skuNames = order.items.map((item) => item.productName).filter(Boolean).slice(0, 2).join(', ')
                const channel = channelOf(order)
                const pay = settlement(order)
                const fulfil = FULFILLMENT(order)
                const gstin = customer?.gstin || order.customerSnapshot?.gstin
                return <tr key={order.orderId} onClick={() => setViewingOrder(order)}>
                  <td>
                    <strong className="ord-num">{order.invoiceNumber || order.orderNumber}</strong>
                    <small>{new Date(order.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {order.cashierName || (channel === 'pos' ? 'POS counter' : 'Sales desk')}</small>
                  </td>
                  <td>
                    <strong>{order.customerName || 'Walk-in customer'}{order.billingType === 'wholesale' && <span className="ord-b2b">B2B</span>}</strong>
                    <small>{customer?.phone || order.customerSnapshot?.phone || (gstin ? `GSTIN ${gstin}` : 'No contact logged')}</small>
                  </td>
                  <td><span className={`ord-badge ${channel === 'wholesale' ? 'amber' : 'blue'}`}>{channel === 'pos' ? 'Retail POS' : channel === 'wholesale' ? 'Wholesale order' : 'Retail order'}</span></td>
                  <td>
                    <strong>{order.items.length} item{order.items.length === 1 ? '' : 's'} · {units} units</strong>
                    <small>{skuNames || 'Line items on invoice'}</small>
                  </td>
                  <td className="num ord-value">
                    <strong>{money(order.totalAmount)}</strong>
                    <small>{gst > 0 ? `Incl. ${money(gst)} GST` : 'GST exempt'}</small>
                  </td>
                  <td><span className={`ord-badge ${pay.tone}`}><i />{pay.label}</span></td>
                  <td><span className={`ord-badge ${fulfil.tone}`}>{fulfil.label}</span></td>
                  <td className="num" onClick={(event) => event.stopPropagation()}>
                    <button type="button" className="ord-menu-btn" aria-label={`Actions for ${order.orderNumber}`} aria-expanded={menu?.id === order.orderId} onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      setMenu((current) => current?.id === order.orderId ? null : { id: order.orderId, order, x: rect.right, y: rect.bottom + 4 })
                    }}>⋮</button>
                  </td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
        <footer className="ord-pagination">
          <span>Showing {visibleOrders.length} of {orders.length} sales orders · sorted by newest</span>
          <span className="ord-pagination-suite">Stockroom Sales &amp; OMS</span>
        </footer>
      </div>
    </AsyncBoundary>

    {menu && <>
      <div className="ord-menu-backdrop" role="presentation" onClick={() => setMenu(null)} />
      <div className="ord-menu" role="menu" style={{ top: menu.y, left: menu.x, transform: 'translateX(-100%)' }}>
        <button type="button" role="menuitem" onClick={() => { setViewingOrder(menu.order); setMenu(null) }}>View invoice</button>
        {menu.order.status !== 'Completed' && menu.order.status !== 'Cancelled' && <>
          <button type="button" role="menuitem" onClick={() => openForm(menu.order)}>Edit order</button>
          <button type="button" role="menuitem" onClick={() => completeOrder(menu.order)}>Complete &amp; invoice</button>
          <button type="button" role="menuitem" className="danger" onClick={() => cancelOrder(menu.order)}>Cancel order</button>
        </>}
      </div>
    </>}

    {viewingOrder && <OrderDetails order={viewingOrder} business={business} onClose={() => setViewingOrder(null)} />}
  </section>
}

function OrderFormModal({ creditSales, editingOrder, customers, products, items, setItems, emptyItem, updateItem, itemTotal, totals, business, saving, handleSubmit, onClose }) {
  return <div className={creditSales ? 'credit-form-backdrop' : 'ord-form-backdrop'} role="presentation" onClick={creditSales ? undefined : onClose}>
    <form role="dialog" aria-modal="true" aria-label="Sales order form" className={`purchase-order-form${creditSales ? '' : ' ord-form'}`} onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
      <div className="product-form-heading">
        <div><p className="dashboard-kicker">{editingOrder ? 'Update order' : 'New sales order'}</p><h3>{editingOrder ? `Edit ${editingOrder.orderNumber}` : 'Create sales order'}</h3></div>
        <button type="button" className="close-button" onClick={onClose} aria-label="Close form">×</button>
      </div>
      <div className="purchase-order-fields">
        <div><label htmlFor="order-customer">Customer *</label><select id="order-customer" name="customerId" defaultValue={editingOrder?.customerId || ''} required><option value="" disabled>Select customer</option>{customers.map((customer) => <option key={customer.customerId} value={customer.customerId}>{customer.name}</option>)}</select></div>
        <div className="field-wide"><label htmlFor="order-notes">Notes</label><input id="order-notes" name="notes" defaultValue={editingOrder?.notes || ''} placeholder="Order notes" /></div>
      </div>
      <div className="order-items-heading"><h4>Order items</h4><button type="button" className="outline-button" onClick={() => setItems([...items, emptyItem()])}>Add item <span>+</span></button></div>
      <div className="order-items">{items.map((item, index) => <div className="order-item-row" key={index}><select aria-label="Select product" value={item.productId} onChange={(event) => updateItem(index, 'productId', event.target.value)} required><option value="">Select product</option>{products.map((product) => <option key={product.productId} value={product.productId}>{product.name} ({product.sku})</option>)}</select><input aria-label="Quantity" type="number" min="1" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} required /><input aria-label="Selling price" type="number" min="0" step="0.01" value={item.sellingPrice} onChange={(event) => updateItem(index, 'sellingPrice', event.target.value)} required /><input aria-label="Discount" type="number" min="0" value={item.discount} onChange={(event) => updateItem(index, 'discount', event.target.value)} /><input aria-label="Tax" type="number" min="0" value={item.tax} onChange={(event) => updateItem(index, 'tax', event.target.value)} /><strong>{business.currency} {itemTotal(item).toFixed(2)}</strong>{items.length > 1 && <button type="button" className="remove-item" onClick={() => setItems(items.filter((_, itemIndex) => itemIndex !== index))}>×</button>}</div>)}</div>
      <p className="order-total">Total: <strong>{business.currency} {totals.totalAmount.toFixed(2)}</strong></p>
      <div className="product-form-actions"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="submit-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save order'} <span>→</span></button></div>
    </form>
  </div>
}

export default SalesOrders
