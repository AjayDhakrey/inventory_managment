import { useCallback, useState } from 'react'
import { supplierApi } from '../api/supplierApi.js'
import { purchaseOrderApi } from '../api/purchaseOrderApi.js'
import { paymentApi } from '../api/paymentApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'

const PHONE_PATTERN = /^[+\d][\d\s()-]{6,}$/

function Suppliers({ business }) {
  const load = useCallback(
    () => Promise.all([supplierApi.list(), purchaseOrderApi.list(), paymentApi.list({ type: 'purchase' })]),
    [],
  )
  const { data, loading, error, refetch, setData } = useResource(load, [], [[], [], []])
  const [suppliers, purchaseOrders, payments] = data

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [formOpen, setFormOpen] = useState(false)
  const [viewingSupplier, setViewingSupplier] = useState(null)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)

  const updateSuppliers = (updater) => setData((current) => [updater(current[0]), current[1], current[2]])

  const paymentSummary = (supplierId) => {
    const orders = purchaseOrders.filter((order) => order.supplierId === supplierId)
    const total = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)
    const paid = payments
      .filter((payment) => orders.some((order) => order.purchaseOrderId === payment.referenceId))
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    return { total, paid, outstanding: Math.max(0, total - paid), status: total === 0 || paid === 0 ? 'Pending' : paid < total ? 'Partially Paid' : 'Paid' }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    const data = new FormData(event.currentTarget)
    const supplier = {
      supplierName: data.get('supplierName').trim(),
      contactPerson: data.get('contactPerson').trim(),
      phone: data.get('phone').trim(),
      email: data.get('email').trim().toLowerCase(),
      address: data.get('address').trim(),
      city: data.get('city').trim(),
      state: data.get('state').trim(),
      taxNumber: data.get('taxNumber').trim(),
      paymentTerms: data.get('paymentTerms'),
      notes: data.get('notes').trim(),
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
    if (!window.confirm(`Archive ${supplier.supplierName}?`)) return
    try {
      const saved = await supplierApi.archive(supplier.supplierId)
      updateSuppliers((list) => list.map((item) => (item.supplierId === saved.supplierId ? saved : item)))
      setMessage({ type: 'success', text: `${supplier.supplierName} was archived.` })
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not archive the supplier.' })
    }
  }

  const filteredSuppliers = suppliers.filter((supplier) => (statusFilter === 'all' || supplier.status === statusFilter) && `${supplier.supplierName} ${supplier.contactPerson} ${supplier.email} ${supplier.city}`.toLowerCase().includes(search.toLowerCase()))

  return <section className="suppliers-page"><div className="products-toolbar"><div><p className="dashboard-kicker">Purchases / Suppliers</p><h2>Suppliers</h2><p className="products-count">{suppliers.filter((supplier) => supplier.status === 'active').length} active suppliers in {business.name}</p></div><button className="submit-button product-add-button" type="button" onClick={() => { setEditingSupplier(null); setFormOpen(true); setMessage(null) }}>Add supplier <span>+</span></button></div>{message && <p className={`form-status ${message.type}`}>{message.text}</p>}<div className="products-controls"><div className="search-box"><span>⌕</span><input aria-label="Search suppliers" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by supplier, contact, or city" /></div><select className="supplier-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter suppliers"><option value="active">Active suppliers</option><option value="archived">Archived suppliers</option><option value="all">All suppliers</option></select></div>{formOpen && <form className="supplier-form" onSubmit={handleSubmit}><div className="product-form-heading"><div><p className="dashboard-kicker">{editingSupplier ? 'Update supplier' : 'New supplier'}</p><h3>{editingSupplier ? 'Edit supplier' : 'Add a supplier'}</h3></div><button type="button" className="close-button" onClick={() => setFormOpen(false)} aria-label="Close form">×</button></div><div className="supplier-form-grid"><div><label htmlFor="supplier-name">Supplier name *</label><input id="supplier-name" name="supplierName" defaultValue={editingSupplier?.supplierName || ''} placeholder="e.g. Sharma Wholesale" required /></div><div><label htmlFor="supplier-contact">Contact person</label><input id="supplier-contact" name="contactPerson" defaultValue={editingSupplier?.contactPerson || ''} placeholder="Contact name" /></div><div><label htmlFor="supplier-phone">Phone *</label><input id="supplier-phone" name="phone" type="tel" defaultValue={editingSupplier?.phone || ''} placeholder="+91 98765 43210" required /></div><div><label htmlFor="supplier-email">Email</label><input id="supplier-email" name="email" type="email" defaultValue={editingSupplier?.email || ''} placeholder="supplier@example.com" /></div><div className="field-wide"><label htmlFor="supplier-address">Address</label><input id="supplier-address" name="address" defaultValue={editingSupplier?.address || ''} placeholder="Street and building name" /></div><div><label htmlFor="supplier-city">City</label><input id="supplier-city" name="city" defaultValue={editingSupplier?.city || ''} placeholder="City" /></div><div><label htmlFor="supplier-state">State</label><input id="supplier-state" name="state" defaultValue={editingSupplier?.state || ''} placeholder="State" /></div><div><label htmlFor="supplier-tax">GST / Tax number</label><input id="supplier-tax" name="taxNumber" defaultValue={editingSupplier?.taxNumber || ''} placeholder="GSTIN or tax ID" /></div><div><label htmlFor="supplier-terms">Payment terms</label><select id="supplier-terms" name="paymentTerms" defaultValue={editingSupplier?.paymentTerms || 'Due on receipt'}><option>Due on receipt</option><option>Net 7</option><option>Net 15</option><option>Net 30</option><option>Net 60</option></select></div><div className="field-wide"><label htmlFor="supplier-notes">Notes</label><textarea id="supplier-notes" name="notes" defaultValue={editingSupplier?.notes || ''} placeholder="Add notes about this supplier" /></div></div><div className="product-form-actions"><button type="button" className="outline-button" onClick={() => setFormOpen(false)}>Cancel</button><button className="submit-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save supplier'} <span>→</span></button></div></form>}<AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!filteredSuppliers.length} emptyText={suppliers.length ? 'No suppliers match your filters.' : 'No suppliers yet. Add your first supplier.'}><div className="suppliers-table products-table"><div className="supplier-table-row supplier-table-head"><span>Supplier</span><span>Contact</span><span>Payment</span><span>Status</span><span>Actions</span></div>{filteredSuppliers.map((supplier) => { const summary = paymentSummary(supplier.supplierId); return <div className="supplier-table-row" key={supplier.supplierId}><span className="product-cell"><span className="product-thumb">{supplier.supplierName[0].toUpperCase()}</span><span><strong>{supplier.supplierName}</strong><small>{supplier.city || 'No city'}{supplier.taxNumber ? ` · ${supplier.taxNumber}` : ''}</small></span></span><span><strong className="supplier-contact-name">{supplier.contactPerson || 'No contact'}</strong><small className="supplier-contact-detail">{supplier.phone}</small></span><span><strong className={`payment-status ${summary.status.toLowerCase().replaceAll(' ', '-')}`}>{summary.status}</strong><small className="supplier-contact-detail">Due {business.currency} {summary.outstanding.toFixed(2)}</small></span><span className={`user-status ${supplier.status}`}>{supplier.status}</span><span className="product-actions"><button type="button" onClick={() => setViewingSupplier(supplier)}>View</button><button type="button" onClick={() => { setEditingSupplier(supplier); setFormOpen(true) }}>Edit</button>{supplier.status === 'active' && <button type="button" onClick={() => archiveSupplier(supplier)}>Archive</button>}</span></div> })}</div></AsyncBoundary>{viewingSupplier && <div className="supplier-modal-backdrop" role="presentation" onClick={() => setViewingSupplier(null)}><article className="supplier-modal" role="dialog" aria-modal="true" aria-labelledby="supplier-details-title" onClick={(event) => event.stopPropagation()}><div className="product-form-heading"><div><p className="dashboard-kicker">Supplier profile</p><h3 id="supplier-details-title">{viewingSupplier.supplierName}</h3></div><button type="button" className="close-button" onClick={() => setViewingSupplier(null)} aria-label="Close supplier details">×</button></div><div className="supplier-detail-grid"><div><small>Contact person</small><strong>{viewingSupplier.contactPerson || 'Not provided'}</strong></div><div><small>Phone</small><strong>{viewingSupplier.phone}</strong></div><div><small>Email</small><strong>{viewingSupplier.email || 'Not provided'}</strong></div><div><small>Payment terms</small><strong>{viewingSupplier.paymentTerms}</strong></div><div><small>Total purchases</small><strong>{business.currency} {paymentSummary(viewingSupplier.supplierId).total.toFixed(2)}</strong></div><div><small>Outstanding</small><strong>{business.currency} {paymentSummary(viewingSupplier.supplierId).outstanding.toFixed(2)}</strong></div><div><small>Address</small><strong>{[viewingSupplier.address, viewingSupplier.city, viewingSupplier.state].filter(Boolean).join(', ') || 'Not provided'}</strong></div><div><small>GST / Tax number</small><strong>{viewingSupplier.taxNumber || 'Not provided'}</strong></div></div><div className="supplier-history-empty"><strong>Payment status: {paymentSummary(viewingSupplier.supplierId).status}</strong><span>Payment method is recorded in Orders / Sales / Payments.</span></div></article></div>}</section>
}

export default Suppliers
