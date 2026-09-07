import { useCallback, useMemo, useState } from 'react'
import { supplierApi } from '../api/supplierApi.js'
import { purchaseOrderApi } from '../api/purchaseOrderApi.js'
import { paymentApi } from '../api/paymentApi.js'
import { productApi } from '../api/productApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'
import '../styles/suppliers.css'

const PHONE_PATTERN = /^[+\d][\d\s()-]{6,}$/
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

function SupIcon({ name }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    export: <><path d="M12 3v12m-4-4 4 4 4-4" /><path d="M5 17v3h14v-3" /></>,
    reconcile: <><path d="M4 7h16M4 7l3-3M4 7l3 3M20 17H4m16 0-3-3m3 3-3 3" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    refresh: <><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8m0-4v4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16m0 4v-4h4" /></>,
    vendor: <><path d="M4 21V9l8-5 8 5v12M4 21h16M9 21v-6h6v6" /></>,
    coin: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
    clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3h6v1M9 11h6M9 15h4" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z" /><path d="m9.3 12 2 2 3.4-4.2" /></>,
    pin: <><path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
    next: <path d="M5 12h13m-5-5 5 5-5 5" />,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const topKey = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || ''

function Suppliers({ business, onNavigate, canNavigate }) {
  const load = useCallback(
    () => Promise.all([supplierApi.list(), purchaseOrderApi.list(), paymentApi.list({ type: 'purchase' }), productApi.list()]),
    [],
  )
  const { data, loading, error, refetch, setData } = useResource(load, [], [[], [], [], []])
  const [suppliers, purchaseOrders, payments, products] = data

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [formOpen, setFormOpen] = useState(false)
  const [viewingSupplier, setViewingSupplier] = useState(null)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)
  const [nowTs] = useState(() => Date.now())

  const currency = business.currency || 'INR'
  const money = (value, dp = 2) => {
    const amount = Number(value || 0)
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: dp, maximumFractionDigits: dp }).format(amount)
    } catch {
      return `${currency} ${amount.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
    }
  }
  const updateSuppliers = (updater) => setData((current) => [updater(current[0]), current[1], current[2], current[3]])

  const categoryByProduct = useMemo(() => new Map(products.map((product) => [product.productId, product.category])), [products])

  const meta = useMemo(() => {
    const today = startOfToday()
    const map = new Map()
    for (const supplier of suppliers) {
      const orders = purchaseOrders.filter((order) => order.supplierId === supplier.supplierId)
      const orderIds = new Set(orders.map((order) => order.purchaseOrderId))
      const total = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)
      const paid = payments.filter((payment) => orderIds.has(payment.referenceId)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
      const outstanding = Math.max(0, total - paid)
      const catCount = {}
      for (const order of orders) for (const item of order.items || []) {
        const category = categoryByProduct.get(item.productId)
        if (category) catCount[category] = (catCount[category] || 0) + 1
      }
      const category = topKey(catCount)
      const overdueOrder = orders.find((order) => order.paymentStatus !== 'Paid' && order.expectedDeliveryDate && new Date(order.expectedDeliveryDate) < today)
      const overdueDays = overdueOrder ? Math.round((today - new Date(`${overdueOrder.expectedDeliveryDate}T00:00:00`)) / 864e5) : 0
      let payLabel = 'Pending'
      let payTone = 'amber'
      if (total === 0) { payLabel = 'No orders'; payTone = 'dim' }
      else if (outstanding <= 0) { payLabel = 'Settled'; payTone = 'green' }
      else if (overdueDays > 0) { payLabel = `Overdue (${overdueDays}d)`; payTone = 'rose' }
      map.set(supplier.supplierId, { orders: orders.length, total, paid, outstanding, category, payLabel, payTone, status: outstanding <= 0 && total > 0 ? 'Paid' : paid > 0 ? 'Partially Paid' : 'Pending' })
    }
    return map
  }, [suppliers, purchaseOrders, payments, categoryByProduct])

  const categories = useMemo(() => [...new Set([...meta.values()].map((entry) => entry.category).filter(Boolean))].sort(), [meta])

  const stats = useMemo(() => {
    const monthAgo = nowTs - 30 * 864e5
    const active = suppliers.filter((supplier) => supplier.status === 'active')
    const newCount = suppliers.filter((supplier) => new Date(supplier.createdAt).getTime() >= monthAgo).length
    const withGst = suppliers.filter((supplier) => supplier.taxNumber).length
    const outstanding = [...meta.values()].reduce((sum, entry) => sum + entry.outstanding, 0)
    const dueAccounts = active.filter((supplier) => (meta.get(supplier.supplierId)?.outstanding || 0) > 0).length
    const year = new Date(nowTs).getFullYear()
    const receivedThisYear = purchaseOrders.filter((order) => order.status === 'Received' && new Date(order.createdAt).getFullYear() === year)
    const fulfilDays = receivedThisYear.length
      ? receivedThisYear.reduce((sum, order) => sum + Math.max(0, (new Date(order.updatedAt) - new Date(order.createdAt)) / 864e5), 0) / receivedThisYear.length
      : 0
    const onTime = receivedThisYear.filter((order) => !order.expectedDeliveryDate || new Date(order.updatedAt) <= new Date(`${order.expectedDeliveryDate}T23:59:59`))
    const slaPct = receivedThisYear.length ? (onTime.length / receivedThisYear.length) * 100 : 100
    return {
      total: suppliers.length,
      active: active.length,
      newCount,
      gstPct: suppliers.length ? Math.round((withGst / suppliers.length) * 100) : 0,
      outstanding,
      dueAccounts,
      completedPos: receivedThisYear.length,
      fulfilDays,
      slaPct,
      lateThisYear: receivedThisYear.length - onTime.length,
    }
  }, [suppliers, purchaseOrders, meta, nowTs])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return suppliers.filter((supplier) => {
      if (statusFilter !== 'all' && supplier.status !== statusFilter) return false
      if (categoryFilter !== 'all' && meta.get(supplier.supplierId)?.category !== categoryFilter) return false
      return `${supplier.supplierName} ${supplier.contactPerson} ${supplier.email} ${supplier.city} ${supplier.taxNumber} ${supplier.phone}`.toLowerCase().includes(query)
    })
  }, [suppliers, statusFilter, categoryFilter, search, meta])

  const withReset = (setter) => (value) => { setter(value); setPage(1) }
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    const formData = new FormData(event.currentTarget)
    const supplier = {
      supplierName: formData.get('supplierName').trim(),
      contactPerson: formData.get('contactPerson').trim(),
      phone: formData.get('phone').trim(),
      email: formData.get('email').trim().toLowerCase(),
      address: formData.get('address').trim(),
      city: formData.get('city').trim(),
      state: formData.get('state').trim(),
      taxNumber: formData.get('taxNumber').trim(),
      paymentTerms: formData.get('paymentTerms'),
      notes: formData.get('notes').trim(),
    }
    if (!supplier.supplierName) { setMessage({ type: 'error', text: 'Supplier name is required.' }); return }
    if (!PHONE_PATTERN.test(supplier.phone)) { setMessage({ type: 'error', text: 'Enter a valid supplier phone number.' }); return }
    if (supplier.email && !/^\S+@\S+\.\S+$/.test(supplier.email)) { setMessage({ type: 'error', text: 'Enter a valid supplier email address.' }); return }

    setSaving(true)
    try {
      const saved = editingSupplier
        ? await supplierApi.update(editingSupplier.supplierId, supplier)
        : await supplierApi.create(supplier)
      updateSuppliers((list) => (editingSupplier ? list.map((item) => (item.supplierId === saved.supplierId ? saved : item)) : [saved, ...list]))
      setFormOpen(false)
      setEditingSupplier(null)
      setMessage({ type: 'success', text: editingSupplier ? 'Supplier updated.' : 'Supplier added.' })
      event.currentTarget.reset()
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not save the supplier.' })
    } finally {
      setSaving(false)
    }
  }

  const archiveSupplier = async (supplier) => {
    if (!window.confirm(`Archive ${supplier.supplierName}? Their history stays, but they won't show up when raising new purchase orders.`)) return
    try {
      const saved = await supplierApi.archive(supplier.supplierId)
      updateSuppliers((list) => list.map((item) => (item.supplierId === saved.supplierId ? saved : item)))
      setMessage({ type: 'success', text: `${supplier.supplierName} was archived.` })
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not archive the supplier.' })
    }
  }

  const openForm = (supplier = null) => { setEditingSupplier(supplier); setFormOpen(true); setMessage(null) }

  const exportCsv = () => {
    const escapeCell = (value) => {
      const text = String(value ?? '')
      const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text
      return `"${safe.replaceAll('"', '""')}"`
    }
    const rows = [
      ['Supplier', 'Category', 'Contact', 'Phone', 'Email', 'City', 'GST / Tax', 'Payment Terms', 'Status', 'Total Purchased', 'Outstanding'],
      ...filtered.map((supplier) => {
        const entry = meta.get(supplier.supplierId) || {}
        return [supplier.supplierName, entry.category || '', supplier.contactPerson, supplier.phone, supplier.email, supplier.city, supplier.taxNumber, supplier.paymentTerms, supplier.status, entry.total || 0, entry.outstanding || 0]
      }),
    ]
    const url = URL.createObjectURL(new Blob([rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `suppliers-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const FLOW = [
    { label: 'Suppliers', blurb: 'The vendors you buy from.', nav: null },
    { label: 'Purchase Order', blurb: 'List what you want, agree a price.', nav: 'Purchase Orders' },
    { label: 'Receiving', blurb: 'Delivery arrives — you count and check it.', nav: 'Receiving' },
    { label: 'Stock', blurb: 'Checked goods are added to inventory.', nav: 'Stock' },
    { label: 'Sell', blurb: 'Items leave via POS or customer orders.', nav: 'POS / Billing' },
  ]

  return <section className="sup-page" aria-labelledby="sup-title">
    <header className="sup-heading">
      <div>
        <p className="sup-kicker">Manage your suppliers <span>•</span> {business.name} vendor ledger</p>
        <div className="sup-title-line">
          <h1 id="sup-title">Suppliers</h1>
          <span className="sup-count-badge">{stats.active} active vendors</span>
        </div>
        <p>Directory of every vendor you buy from — their contact details, agreed payment terms, and current credit balances.</p>
      </div>
      <div className="sup-heading-actions">
        <button type="button" onClick={exportCsv} disabled={loading || !!error || !suppliers.length}><SupIcon name="export" />Export CSV</button>
        <button type="button" onClick={() => (canNavigate?.('Payments') !== false ? onNavigate?.('Payments') : null)}><SupIcon name="reconcile" />Reconciliation</button>
        <button type="button" className="primary" onClick={() => openForm()}><SupIcon name="plus" />Add supplier</button>
      </div>
    </header>

    {message && <p className={`sup-message ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}

    <details className="sup-flow">
      <summary><span className="sup-flow-caret" aria-hidden="true" /> How goods get from a supplier onto your shelves — <b>Suppliers → PO → Receiving → Stock → Sell</b></summary>
      <ol className="sup-flow-steps">
        {FLOW.map((step, index, all) => (
          <li key={step.label} className={step.nav ? 'link' : 'current'}>
            <button type="button" disabled={!step.nav} onClick={() => step.nav && onNavigate?.(step.nav)}>
              <span className="sup-flow-index">{index + 1}</span>
              <strong>{step.label}{step.nav ? '' : ' · you are here'}</strong>
              <small>{step.blurb}</small>
            </button>
            {index < all.length - 1 && <span className="sup-flow-arrow" aria-hidden="true"><SupIcon name="next" /></span>}
          </li>
        ))}
      </ol>
    </details>

    <div className="sup-kpis" aria-busy={loading}>
      <article className="sup-kpi">
        <span>Total Suppliers <i className="teal"><SupIcon name="vendor" /></i></span>
        <strong>{loading || error ? '—' : stats.total}{stats.newCount > 0 && <em>↑ +{stats.newCount} new</em>}</strong>
        <p>{stats.gstPct}% with GST / tax number on file</p>
      </article>
      <article className={`sup-kpi${stats.outstanding > 0 ? ' sup-kpi-alert' : ''}`}>
        <span>Outstanding Payables <i className="amber"><SupIcon name="coin" /></i></span>
        <strong className="sup-money">{loading || error ? '—' : money(stats.outstanding)}</strong>
        <p><b>Due across {stats.dueAccounts} active account{stats.dueAccounts === 1 ? '' : 's'}</b></p>
      </article>
      <article className="sup-kpi">
        <span>Completed POs (YTD) <i className="blue"><SupIcon name="clipboard" /></i></span>
        <strong>{loading || error ? '—' : stats.completedPos} <small>POs</small></strong>
        <p>Average fulfilment: {stats.fulfilDays.toFixed(1)} days</p>
      </article>
      <article className="sup-kpi">
        <span>Vendor SLA Fulfilment <i className="purple"><SupIcon name="shield" /></i></span>
        <strong className="sup-good">{loading || error ? '—' : `${stats.slaPct.toFixed(1)}%`} <small>on-time</small></strong>
        <p>{stats.lateThisYear === 0 ? 'Zero late deliveries this year' : `${stats.lateThisYear} late deliveries this year`}</p>
      </article>
    </div>

    <div className="sup-toolbar">
      <label className="sup-search">
        <SupIcon name="search" />
        <input aria-label="Search suppliers" value={search} onChange={(event) => withReset(setSearch)(event.target.value)} placeholder="Search by supplier, contact, or city" />
      </label>
      <select value={statusFilter} onChange={(event) => withReset(setStatusFilter)(event.target.value)} aria-label="Filter by status">
        <option value="active">Active suppliers</option>
        <option value="archived">Archived suppliers</option>
        <option value="all">All suppliers</option>
      </select>
      <select value={categoryFilter} onChange={(event) => withReset(setCategoryFilter)(event.target.value)} aria-label="Filter by category">
        <option value="all">All categories</option>
        {categories.map((category) => <option key={category} value={category}>{category}</option>)}
      </select>
      <button type="button" className="sup-refresh" onClick={refetch} aria-label="Refresh suppliers"><SupIcon name="refresh" /></button>
    </div>

    {formOpen && <form className="supplier-form" onSubmit={handleSubmit}>
      <div className="product-form-heading">
        <div><p className="dashboard-kicker">{editingSupplier ? 'Update supplier' : 'New supplier'}</p><h3>{editingSupplier ? `Edit ${editingSupplier.supplierName}` : 'Add a supplier'}</h3></div>
        <button type="button" className="close-button" onClick={() => setFormOpen(false)} aria-label="Close form">×</button>
      </div>
      <div className="supplier-form-grid">
        <div><label htmlFor="supplier-name">Supplier name *</label><input id="supplier-name" name="supplierName" defaultValue={editingSupplier?.supplierName || ''} placeholder="e.g. Sharma Wholesale" required /></div>
        <div><label htmlFor="supplier-contact">Contact person</label><input id="supplier-contact" name="contactPerson" defaultValue={editingSupplier?.contactPerson || ''} placeholder="Contact name" /></div>
        <div><label htmlFor="supplier-phone">Phone *</label><input id="supplier-phone" name="phone" type="tel" defaultValue={editingSupplier?.phone || ''} placeholder="+91 98765 43210" required /></div>
        <div><label htmlFor="supplier-email">Email</label><input id="supplier-email" name="email" type="email" defaultValue={editingSupplier?.email || ''} placeholder="supplier@example.com" /></div>
        <div className="field-wide"><label htmlFor="supplier-address">Address</label><input id="supplier-address" name="address" defaultValue={editingSupplier?.address || ''} placeholder="Street and building name" /></div>
        <div><label htmlFor="supplier-city">City</label><input id="supplier-city" name="city" defaultValue={editingSupplier?.city || ''} placeholder="City" /></div>
        <div><label htmlFor="supplier-state">State</label><input id="supplier-state" name="state" defaultValue={editingSupplier?.state || ''} placeholder="State" /></div>
        <div><label htmlFor="supplier-tax">GST / Tax number</label><input id="supplier-tax" name="taxNumber" defaultValue={editingSupplier?.taxNumber || ''} placeholder="GSTIN or tax ID" /></div>
        <div><label htmlFor="supplier-terms">Payment terms</label><select id="supplier-terms" name="paymentTerms" defaultValue={editingSupplier?.paymentTerms || 'Due on receipt'}><option>Due on receipt</option><option>Net 7</option><option>Net 15</option><option>Net 30</option><option>Net 60</option></select></div>
        <div className="field-wide"><label htmlFor="supplier-notes">Notes</label><textarea id="supplier-notes" name="notes" defaultValue={editingSupplier?.notes || ''} placeholder="Add notes about this supplier" /></div>
      </div>
      <div className="product-form-actions"><button type="button" className="outline-button" onClick={() => setFormOpen(false)}>Cancel</button><button className="submit-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save supplier'} <span>→</span></button></div>
    </form>}

    <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!filtered.length} emptyText={suppliers.length ? 'No suppliers match your filters.' : 'No suppliers yet. Add your first supplier to start raising purchase orders.'}>
      <div className="sup-table-wrap">
        <div className="sup-table-scroll" tabIndex={0} role="region" aria-label="Suppliers">
          <table className="sup-table">
            <thead><tr>
              <th>Supplier</th><th>Contact</th><th>Payment</th><th>Status</th><th className="num">Actions</th>
            </tr></thead>
            <tbody>
              {pageRows.map((supplier) => {
                const entry = meta.get(supplier.supplierId) || { outstanding: 0, payLabel: 'No orders', payTone: 'dim' }
                return <tr key={supplier.supplierId}>
                  <td>
                    <div className="sup-name">
                      <span className="sup-avatar">{supplier.supplierName[0].toUpperCase()}</span>
                      <div>
                        <strong>{supplier.supplierName}{entry.category && <span className="sup-cat">{entry.category}</span>}</strong>
                        <small><SupIcon name="pin" />{[supplier.city, supplier.state].filter(Boolean).join(', ') || 'Location not set'}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong>{supplier.contactPerson || 'No contact person'}</strong>
                    <small>{supplier.phone}{supplier.email ? ` • ${supplier.email}` : ''}</small>
                  </td>
                  <td className="sup-pay">
                    <strong className={entry.payTone}>{entry.payLabel}</strong>
                    <small>Due {money(entry.outstanding)}</small>
                  </td>
                  <td><span className={`sup-badge ${supplier.status === 'active' ? 'green' : 'dim'}`}>{supplier.status}</span></td>
                  <td className="num">
                    <div className="sup-row-actions">
                      <button type="button" onClick={() => setViewingSupplier(supplier)}>View</button>
                      <button type="button" onClick={() => openForm(supplier)}>Edit</button>
                      {supplier.status === 'active' && <button type="button" className="danger" onClick={() => archiveSupplier(supplier)}>Archive</button>}
                    </div>
                  </td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
        <footer className="sup-pagination">
          <span>Showing {(currentPage - 1) * rowsPerPage + 1}–{Math.min(currentPage * rowsPerPage, filtered.length)} of {filtered.length} {statusFilter === 'all' ? '' : `${statusFilter} `}suppliers in {business.name}</span>
          <div className="sup-pagination-controls">
            <label>Rows per page
              <select value={rowsPerPage} onChange={(event) => { setRowsPerPage(Number(event.target.value)); setPage(1) }}>
                {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous page">‹</button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).slice(0, 5).map((number) => (
              <button type="button" key={number} className={number === currentPage ? 'active' : ''} onClick={() => setPage(number)}>{number}</button>
            ))}
            <button type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)} aria-label="Next page">›</button>
          </div>
        </footer>
      </div>
    </AsyncBoundary>

    <footer className="sup-statusbar">
      <span><i />Stockroom Pro · Vendor ledger</span>
      <span>{business.currency === 'INR' ? 'Node ap-south-1 · Mumbai' : 'Workspace region'}</span>
      <span>{stats.active} active · {stats.total - stats.active} archived</span>
      <span>{money(stats.outstanding, 0)} payable</span>
      <span className="sup-statusbar-suite">Enterprise Procurement OS</span>
    </footer>

    {viewingSupplier && <div className="supplier-modal-backdrop" role="presentation" onClick={() => setViewingSupplier(null)}>
      <article className="supplier-modal" role="dialog" aria-modal="true" aria-labelledby="supplier-details-title" onClick={(event) => event.stopPropagation()}>
        <div className="product-form-heading">
          <div><p className="dashboard-kicker">Supplier profile</p><h3 id="supplier-details-title">{viewingSupplier.supplierName}</h3></div>
          <button type="button" className="close-button" onClick={() => setViewingSupplier(null)} aria-label="Close supplier details">×</button>
        </div>
        <div className="supplier-detail-grid">
          <div><small>Contact person</small><strong>{viewingSupplier.contactPerson || 'Not provided'}</strong></div>
          <div><small>Phone</small><strong>{viewingSupplier.phone}</strong></div>
          <div><small>Email</small><strong>{viewingSupplier.email || 'Not provided'}</strong></div>
          <div><small>Payment terms</small><strong>{viewingSupplier.paymentTerms}</strong></div>
          <div><small>Category</small><strong>{meta.get(viewingSupplier.supplierId)?.category || 'Not established'}</strong></div>
          <div><small>Purchase orders</small><strong>{meta.get(viewingSupplier.supplierId)?.orders || 0}</strong></div>
          <div><small>Total purchased</small><strong>{money(meta.get(viewingSupplier.supplierId)?.total || 0)}</strong></div>
          <div><small>Outstanding</small><strong>{money(meta.get(viewingSupplier.supplierId)?.outstanding || 0)}</strong></div>
          <div><small>Address</small><strong>{[viewingSupplier.address, viewingSupplier.city, viewingSupplier.state].filter(Boolean).join(', ') || 'Not provided'}</strong></div>
          <div><small>GST / Tax number</small><strong>{viewingSupplier.taxNumber || 'Not provided'}</strong></div>
        </div>
        <div className="supplier-history-empty">
          <strong>Payment status: {meta.get(viewingSupplier.supplierId)?.status || 'Pending'}</strong>
          <span>You record payments to this supplier under Orders / Sales → Payments.</span>
        </div>
      </article>
    </div>}
  </section>
}

export default Suppliers
