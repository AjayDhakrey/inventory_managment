import { useCallback, useState } from 'react'
import { customerApi } from '../api/customerApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'

function Customers({ business }) {
  const loadCustomers = useCallback(() => customerApi.list(), [])
  const { data: customers, loading, error, refetch, setData } = useResource(loadCustomers, [], [])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [formOpen, setFormOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [viewingCustomer, setViewingCustomer] = useState(null)
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    const data = new FormData(event.currentTarget)
    const customer = {
      name: data.get('name').trim(),
      phone: data.get('phone').trim(),
      email: data.get('email').trim().toLowerCase(),
      address: data.get('address').trim(),
      city: data.get('city').trim(),
      state: data.get('state').trim(),
      gstin: data.get('gstin').trim().toUpperCase(),
      customerType: data.get('customerType'),
      notes: data.get('notes').trim(),
    }
    if (!customer.name) { setMessage({ type: 'error', text: 'Customer name is required.' }); return }
    if (customer.email && !/^\S+@\S+\.\S+$/.test(customer.email)) { setMessage({ type: 'error', text: 'Enter a valid customer email.' }); return }
    if (customer.phone && !/^[+\d][\d\s()-]{6,}$/.test(customer.phone)) { setMessage({ type: 'error', text: 'Enter a valid customer phone number.' }); return }

    setSaving(true)
    try {
      const saved = editingCustomer
        ? await customerApi.update(editingCustomer.customerId, customer)
        : await customerApi.create(customer)
      setData((current) => (editingCustomer ? current.map((item) => (item.customerId === saved.customerId ? saved : item)) : [saved, ...current]))
      setFormOpen(false)
      setEditingCustomer(null)
      setMessage({ type: 'success', text: editingCustomer ? 'Customer updated.' : 'Customer added.' })
      event.currentTarget.reset()
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not save the customer.' })
    } finally {
      setSaving(false)
    }
  }

  const archiveCustomer = async (customer) => {
    if (!window.confirm(`Archive ${customer.name}?`)) return
    try {
      const saved = await customerApi.archive(customer.customerId)
      setData((current) => current.map((item) => (item.customerId === saved.customerId ? saved : item)))
      setMessage({ type: 'success', text: `${customer.name} was archived.` })
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not archive the customer.' })
    }
  }

  const visibleCustomers = customers.filter((customer) => (statusFilter === 'all' || customer.status === statusFilter) && `${customer.name} ${customer.email} ${customer.phone} ${customer.city}`.toLowerCase().includes(search.toLowerCase()))

  return <section className="customers-page"><div className="products-toolbar"><div><p className="dashboard-kicker">Orders / Sales / Customers</p><h2>Customers</h2><p className="products-count">{customers.filter((customer) => customer.status === 'active').length} active customers in {business.name}</p></div><button className="submit-button product-add-button" type="button" onClick={() => { setEditingCustomer(null); setFormOpen(true); setMessage(null) }}>Add customer <span>+</span></button></div>{message && <p className={`form-status ${message.type}`}>{message.text}</p>}<div className="products-controls"><div className="search-box"><span>⌕</span><input aria-label="Search customers" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email, phone, or city" /></div><select className="supplier-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter customers"><option value="active">Active customers</option><option value="archived">Archived customers</option><option value="all">All customers</option></select></div>{formOpen && <form className="supplier-form" onSubmit={handleSubmit}><div className="product-form-heading"><div><p className="dashboard-kicker">{editingCustomer ? 'Update customer' : 'New customer'}</p><h3>{editingCustomer ? 'Edit customer' : 'Add a customer'}</h3></div><button type="button" className="close-button" onClick={() => setFormOpen(false)} aria-label="Close form">×</button></div><div className="supplier-form-grid"><div><label htmlFor="customer-name">Customer name *</label><input id="customer-name" name="name" defaultValue={editingCustomer?.name || ''} placeholder="e.g. Priya Sharma" required /></div><div><label htmlFor="customer-phone">Phone</label><input id="customer-phone" name="phone" type="tel" defaultValue={editingCustomer?.phone || ''} placeholder="+91 98765 43210" /></div><div><label htmlFor="customer-email">Email</label><input id="customer-email" name="email" type="email" defaultValue={editingCustomer?.email || ''} placeholder="customer@example.com" /></div><div><label htmlFor="customer-city">City</label><input id="customer-city" name="city" defaultValue={editingCustomer?.city || ''} placeholder="City" /></div><div><label htmlFor="customer-state">State</label><input id="customer-state" name="state" defaultValue={editingCustomer?.state || ''} placeholder="State" /></div><div><label htmlFor="customer-gstin">GSTIN</label><input id="customer-gstin" name="gstin" defaultValue={editingCustomer?.gstin || ''} placeholder="GST registration number" /></div><div><label htmlFor="customer-type">Customer type</label><select id="customer-type" name="customerType" defaultValue={editingCustomer?.customerType || 'retail'}><option value="retail">Retail</option><option value="wholesale">Wholesale</option></select></div><div className="field-wide"><label htmlFor="customer-address">Address</label><input id="customer-address" name="address" defaultValue={editingCustomer?.address || ''} placeholder="Street and building name" /></div><div className="field-wide"><label htmlFor="customer-notes">Notes</label><textarea id="customer-notes" name="notes" defaultValue={editingCustomer?.notes || ''} placeholder="Add customer notes" /></div></div><div className="product-form-actions"><button type="button" className="outline-button" onClick={() => setFormOpen(false)}>Cancel</button><button className="submit-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save customer'} <span>→</span></button></div></form>}<AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!visibleCustomers.length} emptyText={customers.length ? 'No customers match your filters.' : 'No customers yet. Add your first customer.'}><div className="suppliers-table products-table"><div className="supplier-table-row supplier-table-head"><span>Customer</span><span>Contact</span><span>Purchases</span><span>Status</span><span>Actions</span></div>{visibleCustomers.map((customer) => <div className="supplier-table-row" key={customer.customerId}><span className="product-cell"><span className="product-thumb">{customer.name[0].toUpperCase()}</span><span><strong>{customer.name}</strong><small>{customer.city || 'No city'}</small></span></span><span><strong className="supplier-contact-name">{customer.phone || 'No phone'}</strong><small className="supplier-contact-detail">{customer.email || 'No email'}</small></span><span>{business.currency} {Number(customer.totalPurchases).toFixed(2)}</span><span className={`user-status ${customer.status}`}>{customer.status}</span><span className="product-actions"><button type="button" onClick={() => setViewingCustomer(customer)}>View</button><button type="button" onClick={() => { setEditingCustomer(customer); setFormOpen(true) }}>Edit</button>{customer.status === 'active' && <button type="button" onClick={() => archiveCustomer(customer)}>Archive</button>}</span></div>)}</div></AsyncBoundary>{viewingCustomer && <div className="supplier-modal-backdrop" role="presentation" onClick={() => setViewingCustomer(null)}><article className="supplier-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="product-form-heading"><div><p className="dashboard-kicker">Customer profile</p><h3>{viewingCustomer.name}</h3></div><button type="button" className="close-button" onClick={() => setViewingCustomer(null)} aria-label="Close customer details">×</button></div><div className="supplier-detail-grid"><div><small>Phone</small><strong>{viewingCustomer.phone || 'Not provided'}</strong></div><div><small>Email</small><strong>{viewingCustomer.email || 'Not provided'}</strong></div><div><small>Address</small><strong>{[viewingCustomer.address, viewingCustomer.city, viewingCustomer.state].filter(Boolean).join(', ') || 'Not provided'}</strong></div><div><small>Outstanding balance</small><strong>{business.currency} {Number(viewingCustomer.outstandingBalance).toFixed(2)}</strong></div></div><div className="supplier-history-empty"><strong>Order history</strong><span>Order history will populate when Sales / Orders is connected.</span></div></article></div>}</section>
}

export default Customers
