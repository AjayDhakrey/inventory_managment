import { useCallback, useEffect, useState } from 'react'
import { businessApi } from '../api/businessApi.js'
import { reportApi } from '../api/reportApi.js'
import { returnApi } from '../api/returnApi.js'
import { productApi } from '../api/productApi.js'
import { salesOrderApi } from '../api/salesOrderApi.js'
import { purchaseOrderApi } from '../api/purchaseOrderApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'
import SalesReturns from './SalesReturns.jsx'

function BusinessSettings({ business, onBusinessUpdate, onBusinessDeleted }) {
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteName, setDeleteName] = useState('')
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    if (!deleteOpen) return undefined
    const close = (event) => event.key === 'Escape' && !deleting && setDeleteOpen(false)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [deleteOpen, deleting])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    const data = new FormData(event.currentTarget)
    const payload = {
      name: data.get('name').trim(),
      industry: data.get('industry'),
      businessType: data.get('businessType'),
      phone: data.get('phone').trim(),
      email: data.get('email').trim().toLowerCase(),
      address: data.get('address').trim(),
      city: data.get('city').trim(),
      state: data.get('state').trim(),
      country: data.get('country'),
      currency: data.get('currency'),
      gstin: data.get('gstin').trim().toUpperCase(),
    }
    setSaving(true)
    try {
      const updated = await businessApi.update(payload)
      onBusinessUpdate(updated)
      setMessage({ type: 'success', text: 'Business profile saved.' })
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not save the business profile.' })
    } finally {
      setSaving(false)
    }
  }

  const removeBusiness = async () => {
    if (deleteName.trim() !== business.name) return
    setDeleting(true)
    try {
      await businessApi.remove()
      onBusinessDeleted?.()
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not delete the business workspace.' })
      setDeleteOpen(false)
      setDeleting(false)
    }
  }

  return <section className="settings-page"><div className="products-toolbar"><div><p className="dashboard-kicker">Business / Profile</p><h2>Business Profile</h2><p className="products-count">Identity, industry, contact and regional details for {business.name}</p></div><span className="business-filter">{business.currency} · {business.industry}</span></div><form className="settings-form" onSubmit={handleSubmit}><div className="product-form-heading"><div><p className="dashboard-kicker">Company information</p><h3>Business details</h3></div></div><div className="settings-grid"><div><label htmlFor="business-settings-name">Business name *</label><input id="business-settings-name" name="name" defaultValue={business.name} required /></div><div><label htmlFor="business-settings-industry">Industry *</label><select id="business-settings-industry" name="industry" defaultValue={business.industry} required>{['grocery', 'clothing', 'electronics', 'hardware', 'pharmacy', 'restaurant', 'automobile', 'manufacturing', 'wholesale', 'retail', 'other'].map((item) => <option key={item}>{item}</option>)}</select></div><div><label htmlFor="business-settings-type">Business type *</label><select id="business-settings-type" name="businessType" defaultValue={business.businessType} required>{['retail', 'wholesale', 'manufacturing', 'service', 'other'].map((item) => <option key={item}>{item}</option>)}</select></div><div><label htmlFor="business-settings-phone">Phone</label><input id="business-settings-phone" name="phone" defaultValue={business.phone} /></div><div><label htmlFor="business-settings-email">Email</label><input id="business-settings-email" name="email" type="email" defaultValue={business.email} /></div><div><label htmlFor="business-settings-country">Country</label><input id="business-settings-country" name="country" defaultValue={business.country} /></div><div><label htmlFor="business-settings-currency">Currency</label><select id="business-settings-currency" name="currency" defaultValue={business.currency}><option>INR</option><option>USD</option><option>GBP</option><option>AUD</option></select></div><div><label htmlFor="business-settings-gstin">Business GSTIN</label><input id="business-settings-gstin" name="gstin" defaultValue={business.gstin || ''} placeholder="GST registration number" /></div><div className="field-wide"><label htmlFor="business-settings-address">Address</label><input id="business-settings-address" name="address" defaultValue={business.address} /></div><div><label htmlFor="business-settings-city">City</label><input id="business-settings-city" name="city" defaultValue={business.city} /></div><div><label htmlFor="business-settings-state">State</label><input id="business-settings-state" name="state" defaultValue={business.state} /></div></div><button className="submit-button settings-save-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'} <span>→</span></button>{message && <p className={`form-status ${message.type}`}>{message.text}</p>}</form><div className="danger-zone"><div><p className="dashboard-kicker">Danger zone</p><h3>Delete business workspace</h3><p>Permanently removes this business and all of its inventory, orders, payments, reports and team records.</p></div><button type="button" className="danger-button" onClick={() => setDeleteOpen(true)}>Delete business</button></div>{deleteOpen && <div className="supplier-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDeleteOpen(false)}><div className="supplier-modal delete-business-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-business-title"><h3 id="delete-business-title">Delete {business.name}?</h3><p>This cannot be undone. Type <strong>{business.name}</strong> to confirm.</p><label htmlFor="delete-business-name">Business name</label><input id="delete-business-name" autoFocus value={deleteName} onChange={(event) => setDeleteName(event.target.value)} /><div className="product-form-actions"><button type="button" className="outline-button" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</button><button type="button" className="danger-button" onClick={removeBusiness} disabled={deleting || deleteName.trim() !== business.name}>{deleting ? 'Deleting…' : 'Permanently delete'}</button></div></div></div>}</section>
}

const DEFAULT_SETTINGS = { lowStockLimit: 10, allowNegativeStock: false, defaultPaymentMethod: 'Cash', taxEnabled: true, invoicePrefix: 'INV', defaultGstRate: 5, upiId: '', allowPriceOverride: false, paymentOffers: [] }

function Settings({ business, onBusinessUpdate }) {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS, ...(business.settings || {}) })
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)
  const updateSetting = (key, value) => setSettings({ ...settings, [key]: value })
  const offer = settings.paymentOffers?.[0] || { code: '', label: '', paymentMethod: 'UPI', discountType: 'percent', value: 0, minimumAmount: 0, maximumDiscount: 0, active: true }
  const updateOffer = (key, value) => updateSetting('paymentOffers', [{ ...offer, [key]: value }])

  const save = async (event) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const updated = await businessApi.update({ settings })
      onBusinessUpdate?.(updated)
      setMessage({ type: 'success', text: 'Settings saved for this business.' })
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not save settings.' })
    } finally {
      setSaving(false)
    }
  }

  return <section className="settings-page"><div className="products-toolbar"><div><p className="dashboard-kicker">Business / Settings</p><h2>Settings</h2><p className="products-count">Rules and defaults for {business.name}</p></div></div><form className="settings-form compact-settings" onSubmit={save}><div className="settings-grid"><div><label htmlFor="settings-low-stock">Low stock limit</label><input id="settings-low-stock" type="number" min="0" value={settings.lowStockLimit} onChange={(event) => updateSetting('lowStockLimit', Number(event.target.value))} /></div><div><label htmlFor="settings-payment">Default payment method</label><select id="settings-payment" value={settings.defaultPaymentMethod} onChange={(event) => updateSetting('defaultPaymentMethod', event.target.value)}><option>Cash</option><option>UPI</option><option>Card</option><option>Bank transfer</option><option>Credit</option><option>Other</option></select></div><div><label htmlFor="settings-invoice">Invoice prefix</label><input id="settings-invoice" value={settings.invoicePrefix} onChange={(event) => updateSetting('invoicePrefix', event.target.value.toUpperCase())} /></div><div><label htmlFor="settings-gst">Default GST rate %</label><input id="settings-gst" type="number" min="0" max="100" step="0.01" value={settings.defaultGstRate} onChange={(event) => updateSetting('defaultGstRate', Number(event.target.value))} /></div><div><label htmlFor="settings-upi">Business UPI ID</label><input id="settings-upi" value={settings.upiId} onChange={(event) => updateSetting('upiId', event.target.value)} placeholder="merchant@bank" /></div><label className="settings-toggle"><input type="checkbox" checked={settings.allowPriceOverride} onChange={(event) => updateSetting('allowPriceOverride', event.target.checked)} /> Allow authorized POS price override</label><div className="field-wide pos-offer-settings"><strong>POS payment offer</strong><input value={offer.code} onChange={(event) => updateOffer('code', event.target.value.toUpperCase())} placeholder="Offer code" /><input value={offer.label} onChange={(event) => updateOffer('label', event.target.value)} placeholder="Offer label" /><select value={offer.paymentMethod} onChange={(event) => updateOffer('paymentMethod', event.target.value)}><option>UPI</option><option>QR</option><option>Debit Card</option><option>Credit Card</option><option>Bank transfer</option></select><select value={offer.discountType} onChange={(event) => updateOffer('discountType', event.target.value)}><option value="percent">Percent</option><option value="fixed">Fixed</option></select><input type="number" min="0" value={offer.value} onChange={(event) => updateOffer('value', Number(event.target.value))} placeholder="Discount value" /><input type="number" min="0" value={offer.minimumAmount} onChange={(event) => updateOffer('minimumAmount', Number(event.target.value))} placeholder="Minimum bill" /><input type="number" min="0" value={offer.maximumDiscount} onChange={(event) => updateOffer('maximumDiscount', Number(event.target.value))} placeholder="Max discount" /></div><label className="settings-toggle"><input type="checkbox" checked={settings.taxEnabled} onChange={(event) => updateSetting('taxEnabled', event.target.checked)} /> Enable tax fields</label><label className="settings-toggle"><input type="checkbox" checked={settings.allowNegativeStock} onChange={(event) => updateSetting('allowNegativeStock', event.target.checked)} /> Allow negative stock</label></div><button className="submit-button settings-save-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'} <span>→</span></button>{message && <p className={`form-status ${message.type}`} role="status">{message.text}</p>}</form></section>
}

function Reports({ business }) {
  const loadReport = useCallback(() => reportApi.summary(), [])
  const { data: report, loading, error, refetch } = useResource(loadReport, [])
  const products = report?.products || []

  return <section className="reports-page"><div className="products-toolbar"><div><p className="dashboard-kicker">Business intelligence</p><h2>Reports</h2><p className="products-count">Live summary for {business.name}</p></div><button className="outline-button" type="button" onClick={() => window.print()}>Print report <span>↗</span></button></div><AsyncBoundary loading={loading} error={error} onRetry={refetch}><div className="report-cards"><article><small>Completed sales</small><strong>{business.currency} {Number(report?.salesTotal || 0).toFixed(2)}</strong></article><article><small>Purchase value</small><strong>{business.currency} {Number(report?.purchaseTotal || 0).toFixed(2)}</strong></article><article><small>Low-stock products</small><strong>{report?.lowStock || 0}</strong></article><article><small>Out of stock</small><strong>{report?.outOfStock || 0}</strong></article><article><small>Products</small><strong>{report?.productCount || 0}</strong></article><article><small>Stock movements</small><strong>{report?.stockMovements || 0}</strong></article></div><div className="report-panel"><div className="section-heading"><div><p className="dashboard-kicker">Inventory report</p><h2>Current stock</h2></div></div><div className="products-table"><div className="product-table-row product-table-head"><span>Product</span><span>Stock</span><span>Value</span><span>Status</span></div>{products.map((product) => <div className="product-table-row" key={product.productId}><span className="product-cell"><span className="product-thumb">{product.name[0]}</span><span><strong>{product.name}</strong><small>{product.sku}</small></span></span><span>{product.currentStock}</span><span>{business.currency} {(product.currentStock * product.purchasePrice).toFixed(2)}</span><span className={`stock-badge ${product.currentStock === 0 ? 'empty' : product.currentStock <= 10 ? 'low' : ''}`}>{product.currentStock === 0 ? 'Out of stock' : product.currentStock <= 10 ? 'Low stock' : 'In stock'}</span></div>)}</div></div></AsyncBoundary></section>
}

function LegacyReturns({ business, purchase = false }) {
  const load = useCallback(
    () => Promise.all([returnApi.list({ type: purchase ? 'purchase' : 'sale' }), productApi.list(), purchase ? purchaseOrderApi.list() : salesOrderApi.list()]),
    [purchase],
  )
  const { data, loading, error, refetch, setData } = useResource(load, [purchase], [[], [], []])
  const [returns, products, orders] = data
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    const data = new FormData(event.currentTarget)
    const payload = {
      type: purchase ? 'purchase' : 'sale',
      orderId: data.get('orderId'),
      productId: data.get('productId'),
      quantity: Number(data.get('quantity')),
      reason: data.get('reason'),
      refundAmount: Number(data.get('refundAmount') || 0),
    }
    if (!payload.orderId || !payload.productId || !payload.quantity) {
      setMessage({ type: 'error', text: 'Select a valid order, product, and return quantity.' })
      return
    }
    setSaving(true)
    try {
      const record = await returnApi.create(payload)
      const [freshReturns, freshProducts] = await Promise.all([returnApi.list({ type: payload.type }), productApi.list()])
      setData((current) => [freshReturns, freshProducts, current[2]])
      setMessage({ type: 'success', text: `${record.returnId} completed and inventory updated.` })
      event.currentTarget.reset()
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not process the return.' })
    } finally {
      setSaving(false)
    }
  }

  return <section className="returns-page"><div className="products-toolbar"><div><p className="dashboard-kicker">{purchase ? 'Purchases / Purchase Returns' : 'Orders / Sales / Returns'}</p><h2>{purchase ? 'Purchase Returns' : 'Sales Returns'}</h2><p className="products-count">Complete returns for {business.name}</p></div><span className="business-filter">{returns.length} completed</span></div>{message && <p className={`form-status ${message.type}`}>{message.text}</p>}<form className="return-form" onSubmit={handleSubmit}><div><label htmlFor="return-order">Order *</label><select id="return-order" name="orderId" defaultValue="" required><option value="" disabled>Select order</option>{orders.map((order) => <option key={order.orderId || order.purchaseOrderId} value={order.orderId || order.purchaseOrderId}>{order.orderNumber} · {purchase ? order.supplierName : order.customerName}</option>)}</select></div><div><label htmlFor="return-product">Product *</label><select id="return-product" name="productId" defaultValue="" required><option value="" disabled>Select product</option>{products.map((product) => <option key={product.productId} value={product.productId}>{product.name} ({product.sku})</option>)}</select></div><div><label htmlFor="return-quantity">Quantity *</label><input id="return-quantity" name="quantity" type="number" min="1" required /></div><div><label htmlFor="return-reason">Reason</label><select id="return-reason" name="reason"><option>Damaged product</option><option>Defective product</option><option>Incorrect product</option><option>Other</option></select></div><div><label htmlFor="return-refund">Refund / credit amount</label><input id="return-refund" name="refundAmount" type="number" min="0" step="0.01" defaultValue="0" /></div><button className="submit-button" type="submit" disabled={saving}>{saving ? 'Processing…' : 'Complete return'} <span>→</span></button></form><AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!returns.length} emptyText="No returns recorded for this business yet."><div className="history-list">{returns.map((item) => <div className="history-row" key={item.returnId}><span className="history-type adjustment">{item.type} return</span><span><strong>{item.returnId} · {item.productName}</strong><small>{item.quantity} units · {item.reason} · {new Date(item.createdAt).toLocaleString()}</small></span><span className="history-quantity">Completed</span></div>)}</div></AsyncBoundary></section>
}

function Returns(props) {
  return props.purchase ? <LegacyReturns {...props} /> : <SalesReturns {...props} />
}

export { BusinessSettings, Settings, Reports, Returns }
