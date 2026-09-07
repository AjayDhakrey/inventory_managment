import { useCallback, useMemo, useState } from 'react'
import { customerApi } from '../api/customerApi.js'
import { salesOrderApi } from '../api/salesOrderApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'
import '../styles/customers.css'

const PHONE_PATTERN = /^[+\d][\d\s()-]{6,}$/

function CustIcon({ name }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    export: <><path d="M12 3v12m-4-4 4 4 4-4" /><path d="M5 17v3h14v-3" /></>,
    whatsapp: <><path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3Z" /><path d="M9 9c0 4 2 6 6 6" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    refresh: <><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8m0-4v4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16m0 4v-4h4" /></>,
    users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.6M20.5 20a5.2 5.2 0 0 0-3.5-4.9" /></>,
    repeat: <><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8m0-4v4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16m0 4v-4h4" /></>,
    wallet: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 14h2" /></>,
    alert: <><path d="M12 4 2 20h20L12 4Z" /><path d="M12 10v5M12 18h.01" /></>,
    phone: <path d="M6 3h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2Z" />,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
    pin: <><path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="3" /></>,
    edit: <path d="M4 20h4L18 10l-4-4L4 16v4ZM14 6l4 4" />,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const TYPE_LABEL = { retail: 'Retail', wholesale: 'Wholesale B2B', dealer: 'Dealer', contractor: 'Contractor' }

function Customers({ business, onNavigate }) {
  const load = useCallback(() => Promise.all([customerApi.list(), salesOrderApi.list()]), [])
  const { data, loading, error, refetch, setData } = useResource(load, [], [[], []])
  const [customers, salesOrders] = data

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('active')
  const [cityFilter, setCityFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [viewingCustomer, setViewingCustomer] = useState(null)
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)

  const currency = business.currency || 'INR'
  const money = (value, dp = 2) => {
    const amount = Number(value || 0)
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: dp, maximumFractionDigits: dp }).format(amount)
    } catch {
      return `${currency} ${amount.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
    }
  }

  const setCustomers = (updater) => setData((current) => [updater(current[0]), current[1]])

  const orderCountByCustomer = useMemo(() => {
    const map = new Map()
    for (const order of salesOrders) {
      if (!order.customerId || order.status === 'Cancelled') continue
      map.set(order.customerId, (map.get(order.customerId) || 0) + 1)
    }
    return map
  }, [salesOrders])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    const formData = new FormData(event.currentTarget)
    const customer = {
      name: formData.get('name').trim(),
      phone: formData.get('phone').trim(),
      email: formData.get('email').trim().toLowerCase(),
      address: formData.get('address').trim(),
      city: formData.get('city').trim(),
      state: formData.get('state').trim(),
      gstin: formData.get('gstin').trim().toUpperCase(),
      customerType: formData.get('customerType'),
      notes: formData.get('notes').trim(),
    }
    if (!customer.name) { setMessage({ type: 'error', text: 'Customer name is required.' }); return }
    if (customer.email && !/^\S+@\S+\.\S+$/.test(customer.email)) { setMessage({ type: 'error', text: 'Enter a valid customer email.' }); return }
    if (customer.phone && !PHONE_PATTERN.test(customer.phone)) { setMessage({ type: 'error', text: 'Enter a valid customer phone number.' }); return }

    setSaving(true)
    try {
      const saved = editingCustomer
        ? await customerApi.update(editingCustomer.customerId, customer)
        : await customerApi.create(customer)
      setCustomers((list) => (editingCustomer ? list.map((item) => (item.customerId === saved.customerId ? saved : item)) : [saved, ...list]))
      setFormOpen(false)
      setEditingCustomer(null)
      setMessage({ type: 'success', text: editingCustomer ? 'Customer updated.' : 'Customer added.' })
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not save the customer.' })
    } finally {
      setSaving(false)
    }
  }

  const archiveCustomer = async (customer) => {
    if (!window.confirm(`Archive ${customer.name}? Their purchase history stays intact.`)) return
    try {
      const saved = await customerApi.archive(customer.customerId)
      setCustomers((list) => list.map((item) => (item.customerId === saved.customerId ? saved : item)))
      setMessage({ type: 'success', text: `${customer.name} was archived.` })
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not archive the customer.' })
    }
  }
  const openForm = (customer = null) => { setEditingCustomer(customer); setFormOpen(true); setMessage(null) }

  const cities = useMemo(() => [...new Set(customers.map((customer) => customer.city).filter(Boolean))].sort(), [customers])

  const stats = useMemo(() => {
    const active = customers.filter((customer) => customer.status === 'active')
    const wholesale = active.filter((customer) => customer.customerType && customer.customerType !== 'retail').length
    const totalSpend = customers.reduce((sum, customer) => sum + Number(customer.totalPurchases || 0), 0)
    const withOrders = customers.filter((customer) => (orderCountByCustomer.get(customer.customerId) || 0) > 1).length
    const dueAccounts = customers.filter((customer) => Number(customer.outstandingBalance || 0) > 0)
    return {
      total: customers.length,
      active: active.length,
      retail: active.length - wholesale,
      wholesale,
      repeatRate: customers.length ? Math.round((withOrders / customers.length) * 1000) / 10 : 0,
      totalSpend,
      avgSpend: customers.length ? totalSpend / customers.length : 0,
      pendingDue: dueAccounts.reduce((sum, customer) => sum + Number(customer.outstandingBalance || 0), 0),
      dueCount: dueAccounts.length,
    }
  }, [customers, orderCountByCustomer])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return customers.filter((customer) => {
      if (statusFilter !== 'all' && customer.status !== statusFilter) return false
      if (typeFilter !== 'all' && (customer.customerType || 'retail') !== typeFilter) return false
      if (cityFilter !== 'all' && customer.city !== cityFilter) return false
      return `${customer.name} ${customer.phone} ${customer.email} ${customer.city} ${customer.gstin}`.toLowerCase().includes(query)
    })
  }, [customers, statusFilter, typeFilter, cityFilter, search])

  const exportCsv = () => {
    const escapeCell = (value) => {
      const text = String(value ?? '')
      const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text
      return `"${safe.replaceAll('"', '""')}"`
    }
    const rows = [
      ['Name', 'Type', 'Phone', 'Email', 'City', 'GSTIN', 'Status', 'Lifetime Purchases', 'Outstanding', 'Orders'],
      ...filtered.map((customer) => [customer.name, TYPE_LABEL[customer.customerType] || 'Retail', customer.phone, customer.email, customer.city, customer.gstin, customer.status, customer.totalPurchases || 0, customer.outstandingBalance || 0, orderCountByCustomer.get(customer.customerId) || 0]),
    ]
    const url = URL.createObjectURL(new Blob([rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const tierOf = (customer) => {
    if (customer.customerType && customer.customerType !== 'retail') return { label: 'Wholesale B2B', tone: 'blue' }
    if (Number(customer.totalPurchases || 0) >= 25000) return { label: 'VIP · loyal', tone: 'amber' }
    return { label: 'Retail', tone: 'dim' }
  }

  return <section className="cust-page" aria-labelledby="cust-title">
    <header className="cust-heading">
      <div>
        <p className="cust-kicker">Manage your customers <span>•</span> {business.name} CRM</p>
        <div className="cust-title-line">
          <h1 id="cust-title">Customers</h1>
          <span className="cust-count-badge">{stats.active} active profiles</span>
        </div>
        <p>Every retail shopper and B2B wholesale buyer you sell to — contact details, lifetime spend, and open credit lines.</p>
      </div>
      <div className="cust-heading-actions">
        <button type="button" onClick={exportCsv} disabled={loading || !!error || !customers.length}><CustIcon name="export" />Export CSV</button>
        <button type="button" onClick={() => onNavigate?.('POS / Billing')}><CustIcon name="whatsapp" />Notify customers</button>
        <button type="button" className="primary" onClick={() => openForm()}><CustIcon name="plus" />Add customer<kbd>Alt C</kbd></button>
      </div>
    </header>

    {message && <p className={`cust-message ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}

    <div className="cust-kpis" aria-busy={loading}>
      <article className="cust-kpi">
        <span>Total customers <i className="teal"><CustIcon name="users" /></i></span>
        <strong>{loading || error ? '—' : stats.total}</strong>
        <p>{stats.retail} retail walk-in · {stats.wholesale} wholesale B2B</p>
      </article>
      <article className="cust-kpi">
        <span>Repeat purchase rate <i className="blue"><CustIcon name="repeat" /></i></span>
        <strong className="cust-good">{loading || error ? '—' : `${stats.repeatRate}%`}</strong>
        <p>Customers with more than one order</p>
      </article>
      <article className="cust-kpi">
        <span>Total customer spend <i className="green"><CustIcon name="wallet" /></i></span>
        <strong className="cust-money">{loading || error ? '—' : money(stats.totalSpend, 0)}</strong>
        <p>Across all transactions · avg {money(stats.avgSpend, 0)} / customer</p>
      </article>
      <article className={`cust-kpi${stats.pendingDue > 0 ? ' cust-kpi-alert' : ''}`}>
        <span>Pending credit / dues <i className="amber"><CustIcon name="alert" /></i></span>
        <strong className="cust-money">{loading || error ? '—' : money(stats.pendingDue, 0)}</strong>
        <p><b>{stats.dueCount} account{stats.dueCount === 1 ? '' : 's'}</b> carrying an open balance</p>
      </article>
    </div>

    <div className="cust-toolbar">
      <label className="cust-search">
        <CustIcon name="search" />
        <input aria-label="Search customers" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, mobile, email, or city" />
      </label>
      <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter by type">
        <option value="all">All types ({customers.length})</option>
        {['retail', 'wholesale', 'dealer', 'contractor'].map((type) => <option key={type} value={type}>{TYPE_LABEL[type]}</option>)}
      </select>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
        <option value="active">Active customers</option>
        <option value="archived">Archived customers</option>
        <option value="all">All customers</option>
      </select>
      <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)} aria-label="Filter by city">
        <option value="all">All cities</option>
        {cities.map((city) => <option key={city} value={city}>{city}</option>)}
      </select>
      <button type="button" className="cust-refresh" onClick={refetch} aria-label="Refresh"><CustIcon name="refresh" /></button>
    </div>

    {formOpen && <form className="supplier-form cust-form" onSubmit={handleSubmit}>
      <div className="product-form-heading">
        <div><p className="dashboard-kicker">{editingCustomer ? 'Update customer' : 'New customer'}</p><h3>{editingCustomer ? `Edit ${editingCustomer.name}` : 'Add a customer'}</h3></div>
        <button type="button" className="close-button" onClick={() => setFormOpen(false)} aria-label="Close form">×</button>
      </div>
      <div className="supplier-form-grid">
        <div><label htmlFor="customer-name">Customer name *</label><input id="customer-name" name="name" defaultValue={editingCustomer?.name || ''} placeholder="e.g. Priya Sharma" required /></div>
        <div><label htmlFor="customer-phone">Phone</label><input id="customer-phone" name="phone" type="tel" defaultValue={editingCustomer?.phone || ''} placeholder="+91 98765 43210" /></div>
        <div><label htmlFor="customer-email">Email</label><input id="customer-email" name="email" type="email" defaultValue={editingCustomer?.email || ''} placeholder="customer@example.com" /></div>
        <div><label htmlFor="customer-city">City</label><input id="customer-city" name="city" defaultValue={editingCustomer?.city || ''} placeholder="City" /></div>
        <div><label htmlFor="customer-state">State</label><input id="customer-state" name="state" defaultValue={editingCustomer?.state || ''} placeholder="State" /></div>
        <div><label htmlFor="customer-gstin">GSTIN</label><input id="customer-gstin" name="gstin" defaultValue={editingCustomer?.gstin || ''} placeholder="GST registration number" /></div>
        <div><label htmlFor="customer-type">Customer type</label><select id="customer-type" name="customerType" defaultValue={editingCustomer?.customerType || 'retail'}><option value="retail">Retail</option><option value="wholesale">Wholesale</option><option value="dealer">Dealer</option><option value="contractor">Contractor</option></select></div>
        <div className="field-wide"><label htmlFor="customer-address">Address</label><input id="customer-address" name="address" defaultValue={editingCustomer?.address || ''} placeholder="Street and building name" /></div>
        <div className="field-wide"><label htmlFor="customer-notes">Notes</label><textarea id="customer-notes" name="notes" defaultValue={editingCustomer?.notes || ''} placeholder="Add customer notes" /></div>
      </div>
      <div className="product-form-actions"><button type="button" className="outline-button" onClick={() => setFormOpen(false)}>Cancel</button><button className="submit-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save customer'} <span>→</span></button></div>
    </form>}

    <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!filtered.length} emptyText={customers.length ? 'No customers match your filters.' : 'No customers yet. Add your first customer or ring up a POS sale.'}>
      <div className="cust-table-wrap">
        <div className="cust-table-scroll" tabIndex={0} role="region" aria-label="Customers">
          <table className="cust-table">
            <thead><tr>
              <th>Customer details</th><th>Contact info</th><th className="num">Lifetime purchases</th>
              <th>Credit / dues</th><th>Status</th><th className="num">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map((customer) => {
                const tier = tierOf(customer)
                const orders = orderCountByCustomer.get(customer.customerId) || 0
                const due = Number(customer.outstandingBalance || 0)
                return <tr key={customer.customerId} onClick={() => setViewingCustomer(customer)}>
                  <td>
                    <div className="cust-name">
                      <span className="cust-avatar">{customer.name[0].toUpperCase()}</span>
                      <div>
                        <strong>{customer.name}<span className={`cust-tier ${tier.tone}`}>{tier.label}</span></strong>
                        <small><CustIcon name="pin" />{customer.city || 'City not set'}{customer.gstin ? ` · GSTIN ${customer.gstin}` : ` · ID ${customer.customerId.slice(-6).toUpperCase()}`}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong className="cust-contact"><CustIcon name="phone" />{customer.phone || 'No phone'}</strong>
                    <small><CustIcon name="mail" />{customer.email || 'No email'}</small>
                  </td>
                  <td className="num cust-spend">
                    <strong>{money(customer.totalPurchases)}</strong>
                    <small>{orders} order{orders === 1 ? '' : 's'}</small>
                  </td>
                  <td>
                    <span className={`cust-badge ${due > 0 ? 'amber' : 'green'}`}><i />{due > 0 ? `${money(due)} due` : `${money(0)} clear`}</span>
                  </td>
                  <td><span className={`cust-badge ${customer.status === 'active' ? 'green' : 'dim'}`}>{customer.status}</span></td>
                  <td className="num" onClick={(event) => event.stopPropagation()}>
                    <div className="cust-row-actions">
                      {due > 0
                        ? <button type="button" className="warn" onClick={() => onNavigate?.('Payments')}>Collect due</button>
                        : <button type="button" className="go" onClick={() => onNavigate?.('POS / Billing')}>New sale</button>}
                      <button type="button" aria-label={`View ${customer.name}`} onClick={() => setViewingCustomer(customer)}><CustIcon name="eye" /></button>
                      <button type="button" aria-label={`Edit ${customer.name}`} onClick={() => openForm(customer)}><CustIcon name="edit" /></button>
                      {customer.status === 'active' && <button type="button" className="danger" aria-label={`Archive ${customer.name}`} onClick={() => archiveCustomer(customer)}>×</button>}
                    </div>
                  </td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
        <footer className="cust-pagination">
          <span>Showing {filtered.length} of {customers.length} customer profiles in {business.name}</span>
          <span className="cust-pagination-suite">Stockroom CRM</span>
        </footer>
      </div>
    </AsyncBoundary>

    <footer className="cust-statusbar">
      <span><i />Stockroom Pro · CRM ledger</span>
      <span>{stats.active} active · {stats.total - stats.active} archived</span>
      <span>{money(stats.pendingDue, 0)} in open credit</span>
      <span className="cust-statusbar-suite">Enterprise Retail OS</span>
    </footer>

    {viewingCustomer && <div className="supplier-modal-backdrop" role="presentation" onClick={() => setViewingCustomer(null)}>
      <article className="supplier-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="product-form-heading">
          <div><p className="dashboard-kicker">Customer profile</p><h3>{viewingCustomer.name}</h3></div>
          <button type="button" className="close-button" onClick={() => setViewingCustomer(null)} aria-label="Close customer details">×</button>
        </div>
        <div className="supplier-detail-grid">
          <div><small>Phone</small><strong>{viewingCustomer.phone || 'Not provided'}</strong></div>
          <div><small>Email</small><strong>{viewingCustomer.email || 'Not provided'}</strong></div>
          <div><small>Type</small><strong>{TYPE_LABEL[viewingCustomer.customerType] || 'Retail'}</strong></div>
          <div><small>Payment terms</small><strong>{viewingCustomer.paymentTerms || 'Due on receipt'}</strong></div>
          <div><small>Lifetime purchases</small><strong>{money(viewingCustomer.totalPurchases)}</strong></div>
          <div><small>Outstanding balance</small><strong>{money(viewingCustomer.outstandingBalance)}</strong></div>
          <div><small>Orders placed</small><strong>{orderCountByCustomer.get(viewingCustomer.customerId) || 0}</strong></div>
          <div><small>Credit limit</small><strong>{money(viewingCustomer.creditLimit)}</strong></div>
          <div><small>Address</small><strong>{[viewingCustomer.address, viewingCustomer.city, viewingCustomer.state].filter(Boolean).join(', ') || 'Not provided'}</strong></div>
          <div><small>GSTIN</small><strong>{viewingCustomer.gstin || 'Not provided'}</strong></div>
        </div>
        <div className="supplier-history-empty">
          <strong>Ring up a sale or collect a payment</strong>
          <span>Start a new sale at the POS terminal, or record a credit collection under Payments.</span>
        </div>
      </article>
    </div>}
  </section>
}

export default Customers
