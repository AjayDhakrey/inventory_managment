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
import '../styles/reports.css'
import '../styles/business-settings.css'

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

  return <section className="settings-page"><div className="products-toolbar"><div><p className="dashboard-kicker">Business / Settings</p><h2>Settings</h2><p className="products-count">Rules and defaults for {business.name}</p></div></div><form className="settings-form compact-settings" onSubmit={save}><div className="settings-grid"><div><label htmlFor="settings-low-stock">Low stock limit</label><input id="settings-low-stock" type="number" min="0" value={settings.lowStockLimit} onChange={(event) => updateSetting('lowStockLimit', Number(event.target.value))} /></div><div><label htmlFor="settings-payment">Default payment method</label><select id="settings-payment" value={settings.defaultPaymentMethod} onChange={(event) => updateSetting('defaultPaymentMethod', event.target.value)}><option>Cash</option><option>UPI</option><option>Card</option><option>Bank transfer</option><option>Credit</option><option>Other</option></select></div><div><label htmlFor="settings-invoice">Invoice prefix</label><input id="settings-invoice" value={settings.invoicePrefix} onChange={(event) => updateSetting('invoicePrefix', event.target.value.toUpperCase())} /></div><div><label htmlFor="settings-gst">Default GST rate %</label><input id="settings-gst" type="number" min="0" max="100" step="0.01" value={settings.defaultGstRate} onChange={(event) => updateSetting('defaultGstRate', Number(event.target.value))} /></div><div><label htmlFor="settings-upi">Business UPI ID</label><input id="settings-upi" value={settings.upiId} onChange={(event) => updateSetting('upiId', event.target.value)} placeholder="merchant@bank" /></div><label className="settings-toggle"><input type="checkbox" checked={settings.allowPriceOverride} onChange={(event) => updateSetting('allowPriceOverride', event.target.checked)} /> Allow authorized POS price override</label><div className="field-wide pos-offer-settings"><strong>POS payment offer</strong><input value={offer.code} onChange={(event) => updateOffer('code', event.target.value.toUpperCase())} placeholder="Offer code" /><input value={offer.label} onChange={(event) => updateOffer('label', event.target.value)} placeholder="Offer label" /><select value={offer.paymentMethod} onChange={(event) => updateOffer('paymentMethod', event.target.value)}><option value="Any">Any payment method</option><option>UPI</option><option>QR</option><option>Debit Card</option><option>Credit Card</option><option>Bank transfer</option><option>Cash</option><option>Gift Card</option><option>Store Credit</option></select><select value={offer.discountType} onChange={(event) => updateOffer('discountType', event.target.value)}><option value="percent">Percent</option><option value="fixed">Fixed</option></select><input type="number" min="0" value={offer.value} onChange={(event) => updateOffer('value', Number(event.target.value))} placeholder="Discount value" /><input type="number" min="0" value={offer.minimumAmount} onChange={(event) => updateOffer('minimumAmount', Number(event.target.value))} placeholder="Minimum bill" /><input type="number" min="0" value={offer.maximumDiscount} onChange={(event) => updateOffer('maximumDiscount', Number(event.target.value))} placeholder="Max discount" /></div><label className="settings-toggle"><input type="checkbox" checked={settings.taxEnabled} onChange={(event) => updateSetting('taxEnabled', event.target.checked)} /> Enable tax fields</label><label className="settings-toggle"><input type="checkbox" checked={settings.allowNegativeStock} onChange={(event) => updateSetting('allowNegativeStock', event.target.checked)} /> Allow negative stock</label></div><button className="submit-button settings-save-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'} <span>→</span></button>{message && <p className={`form-status ${message.type}`} role="status">{message.text}</p>}</form></section>
}

function Reports({ business }) {
  const loadReport = useCallback(() => reportApi.summary(), [])
  const { data: report, loading, error, refetch } = useResource(loadReport, [])
  const [stockFilter, setStockFilter] = useState('all')
  const [search, setSearch] = useState('')
  const products = report?.products || []
  const currency = business.currency || 'INR'
  const money = (value, dp = 0) => {
    const amount = Number(value || 0)
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: dp, maximumFractionDigits: dp }).format(amount) }
    catch { return `${currency} ${amount.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}` }
  }
  const num = (value) => Number(value || 0).toLocaleString('en-IN')
  const margin = report?.salesTotal ? Math.round((Number(report.grossProfit || 0) / Number(report.salesTotal)) * 100) : 0

  const visible = products.filter((product) => {
    const stock = Number(product.currentStock || 0)
    const status = stock === 0 ? 'out' : stock <= (product.minimumStock || 10) ? 'low' : 'in'
    if (stockFilter !== 'all' && stockFilter !== status) return false
    return `${product.name} ${product.sku} ${product.category || ''}`.toLowerCase().includes(search.trim().toLowerCase())
  }).sort((a, b) => (b.currentStock * b.purchasePrice) - (a.currentStock * a.purchasePrice))

  const exportCsv = () => {
    const esc = (v) => { const t = String(v ?? ''); return `"${(/^[=+@\-\t\r]/.test(t) ? `'${t}` : t).replaceAll('"', '""')}"` }
    const rows = [['Product', 'SKU', 'Category', 'Stock', 'Unit cost', 'Stock value', 'Status'],
      ...visible.map((p) => { const s = Number(p.currentStock || 0); return [p.name, p.sku, p.category || '', s, p.purchasePrice, s * p.purchasePrice, s === 0 ? 'Out of stock' : s <= (p.minimumStock || 10) ? 'Low stock' : 'In stock'] })]
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `report-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <section className="rep-page" aria-labelledby="rep-title">
    <header className="rep-heading">
      <div>
        <p className="rep-kicker">Business intelligence <span>•</span> Live summary for {business.name}</p>
        <div className="rep-title-line"><h1 id="rep-title">Reports</h1><span className="rep-live">Live data</span></div>
        <p>Consolidated sales, procurement, profitability, and inventory health — recalculated on every load.</p>
      </div>
      <div className="rep-heading-actions">
        <button type="button" onClick={exportCsv} disabled={loading || !!error || !products.length}>Export stock CSV</button>
        <button type="button" className="primary" onClick={() => window.print()}>Print report ↗</button>
      </div>
    </header>

    <AsyncBoundary loading={loading} error={error} onRetry={refetch}>
      <div className="rep-kpis">
        <article className="rep-kpi">
          <span>Completed sales <i>net</i></span>
          <strong className="rep-money rep-good">{money(report?.salesTotal)}</strong>
          <p>{money(report?.grossSalesTotal)} gross · {money(report?.salesReturnTotal)} returned</p>
        </article>
        <article className="rep-kpi">
          <span>Gross profit <i>{margin}% margin</i></span>
          <strong className="rep-money">{money(report?.grossProfit)}</strong>
          <p>Revenue minus cost of goods sold</p>
        </article>
        <article className="rep-kpi">
          <span>Purchase value <i>spend</i></span>
          <strong className="rep-money">{money(report?.purchaseTotal)}</strong>
          <p>{money(report?.purchaseDue)} still owed to suppliers</p>
        </article>
        <article className="rep-kpi">
          <span>Inventory value <i>at cost</i></span>
          <strong className="rep-money">{money(report?.inventoryValue)}</strong>
          <p>{num(report?.totalUnitsInStock)} units · {num(report?.productCount)} SKUs</p>
        </article>
      </div>

      <div className="rep-tiles">
        <article><small>Today's sales</small><strong>{money(report?.todaySales)}</strong><span>{num(report?.todayOrdersCount)} orders</span></article>
        <article><small>Pending orders</small><strong>{num(report?.pendingOrdersCount)}</strong><span>{money(report?.pendingOrdersAmount)} value</span></article>
        <article className={Number(report?.outstandingReceivables || 0) > 0 ? 'warn' : ''}><small>Receivables</small><strong>{money(report?.outstandingReceivables)}</strong><span>Customer credit due</span></article>
        <article><small>Stock movements</small><strong>{num(report?.stockMovements)}</strong><span>{num(report?.stockInCount)} in · {num(report?.stockOutCount)} out</span></article>
        <article className={Number(report?.lowStock || 0) > 0 ? 'warn' : ''}><small>Low stock SKUs</small><strong>{num(report?.lowStock)}</strong><span>At or below reorder level</span></article>
        <article className={Number(report?.outOfStock || 0) > 0 ? 'danger' : ''}><small>Out of stock</small><strong>{num(report?.outOfStock)}</strong><span>Needs restocking now</span></article>
      </div>

      <section className="rep-panel">
        <div className="rep-panel-head">
          <div><p className="rep-kicker">Inventory report</p><h2>Current stock — highest value first</h2></div>
          <div className="rep-panel-tools">
            <label className="rep-search"><span>⌕</span><input aria-label="Search stock" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product or SKU" /></label>
            <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)} aria-label="Stock status filter">
              <option value="all">All items</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option>
            </select>
          </div>
        </div>
        <div className="rep-table-scroll" tabIndex={0} role="region" aria-label="Current stock">
          <table className="rep-table">
            <thead><tr><th>Product</th><th className="num">Stock</th><th className="num">Stock value</th><th>Status</th></tr></thead>
            <tbody>
              {visible.map((product) => {
                const stock = Number(product.currentStock || 0)
                const state = stock === 0 ? 'out' : stock <= (product.minimumStock || 10) ? 'low' : 'in'
                return <tr key={product.productId}>
                  <td>
                    <div className="rep-product"><span className="rep-avatar">{product.name[0].toUpperCase()}</span>
                      <div><strong>{product.name}</strong><small>{product.sku}{product.category ? ` · ${product.category}` : ''}</small></div>
                    </div>
                  </td>
                  <td className="num"><strong className={state === 'in' ? '' : 'rep-flag'}>{num(stock)}</strong></td>
                  <td className="num rep-val">{money(stock * product.purchasePrice)}</td>
                  <td><span className={`rep-badge ${state}`}><i />{state === 'out' ? 'Out of stock' : state === 'low' ? 'Low stock' : 'In stock'}</span></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AsyncBoundary>

    <footer className="rep-statusbar">
      <span><i />Stockroom · business intelligence</span>
      <span>Recalculated {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
      <span className="rep-statusbar-suite">Enterprise Retail OS</span>
    </footer>
  </section>
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
