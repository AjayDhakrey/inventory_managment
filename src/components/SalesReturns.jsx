import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { returnApi } from '../api/returnApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'

const reasons = ['Damaged product', 'Defective product', 'Incorrect product', 'Customer changed mind', 'Size/Fit issue', 'Other']
const conditions = ['Sellable', 'Damaged', 'Defective', 'Opened / Used', 'Other']
const refundMethods = ['Original Payment Method', 'Cash', 'UPI', 'Card', 'Bank transfer', 'Store Credit', 'Customer Balance/Credit', 'Other']
const money = (currency, value) => `${currency} ${Number(value || 0).toFixed(2)}`

export default function SalesReturns({ business, account }) {
  const load = useCallback(() => Promise.all([returnApi.list({ type: 'sale' }), returnApi.eligibleOrders()]), [])
  const { data, loading, error, refetch } = useResource(load, [], [[], []])
  const [returns, orders] = data
  const [orderSearch, setOrderSearch] = useState('')
  const [orderId, setOrderId] = useState('')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [reason, setReason] = useState('Damaged product')
  const [reasonDetails, setReasonDetails] = useState('')
  const [condition, setCondition] = useState('Sellable')
  const [refundMethod, setRefundMethod] = useState('Original Payment Method')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundState, setRefundState] = useState('Pending')
  const [confirming, setConfirming] = useState(false)
  const [selectedReturn, setSelectedReturn] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [filters, setFilters] = useState({ search: '', status: 'all', refundStatus: 'all', reason: 'all', condition: 'all', refundMethod: 'all', dateFrom: '', dateTo: '' })
  const idempotencyKey = useRef('')
  const permissions = account.permissions || []
  const owner = account.role === 'owner'
  const canCreate = owner || permissions.includes('complete_returns') || permissions.includes('create_order')
  const canRefund = owner || permissions.includes('process_refunds')
  const canAdjustRefund = owner || permissions.includes('adjust_refunds')

  useEffect(() => {
    if (!confirming && !selectedReturn) return undefined
    document.body.classList.add('return-modal-open')
    return () => document.body.classList.remove('return-modal-open')
  }, [confirming, selectedReturn])

  const visibleOrders = orders.filter((order) => `${order.orderNumber} ${order.invoiceNumber} ${order.customerName}`.toLowerCase().includes(orderSearch.toLowerCase()))
  const order = orders.find((item) => item.orderId === orderId)
  const item = order?.items.find((line) => line.productId === productId)
  const returnValue = item && quantity > 0 ? Math.round(((item.total || (item.quantity * item.sellingPrice - item.discount + item.tax)) * quantity / item.quantity + Number.EPSILON) * 100) / 100 : 0
  const outstandingAdjustment = Math.min(returnValue, order?.outstandingActual || 0)
  const refundRequired = Math.max(0, Math.round((returnValue - outstandingAdjustment) * 100) / 100)
  const desiredRefund = refundAmount === '' ? refundRequired : Number(refundAmount)
  const invalidQuantity = !item || quantity <= 0 || quantity > item.returnableQuantity || (!['kg', 'gram', 'litre'].includes(item.unit) && !Number.isInteger(Number(quantity)))
  const filteredReturns = useMemo(() => returns.filter((record) => {
    const term = filters.search.toLowerCase()
    return (!term || `${record.returnId} ${record.orderNumber} ${record.productName} ${record.productSku} ${record.customerName}`.toLowerCase().includes(term)) &&
      (filters.status === 'all' || record.status === filters.status) && (filters.refundStatus === 'all' || record.refundStatus === filters.refundStatus) &&
      (filters.reason === 'all' || record.reason === filters.reason) && (filters.condition === 'all' || record.condition === filters.condition) &&
      (filters.refundMethod === 'all' || record.refundMethod?.includes(filters.refundMethod)) &&
      (!filters.dateFrom || new Date(record.createdAt) >= new Date(filters.dateFrom)) && (!filters.dateTo || new Date(record.createdAt) <= new Date(`${filters.dateTo}T23:59:59`))
  }), [returns, filters])

  const selectOrder = (value) => { setOrderId(value); setProductId(''); setQuantity(1); setRefundAmount(''); setMessage(null) }
  const askConfirmation = (event) => {
    event.preventDefault()
    if (!order || invalidQuantity || (reason === 'Other' && !reasonDetails.trim())) { setMessage({ type: 'error', text: 'Complete the order, product, quantity, reason and condition steps.' }); return }
    if (desiredRefund < 0 || desiredRefund > refundRequired || (!canAdjustRefund && desiredRefund !== refundRequired)) { setMessage({ type: 'error', text: 'Refund amount is outside your allowed refundable amount.' }); return }
    idempotencyKey.current ||= globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
    setConfirming(true)
  }
  const confirm = async () => {
    if (saving) return
    setSaving(true); setMessage(null)
    try {
      const record = await returnApi.create({ type: 'sale', orderId, productId, quantity: Number(quantity), reason, reasonDetails, condition, idempotencyKey: idempotencyKey.current })
      let refundPending = record.refundRequired > 0
      let refundFailure = ''
      if (record.refundRequired > 0 && canRefund && desiredRefund > 0) {
        try {
          await returnApi.refund(record.returnId, { amount: desiredRefund, method: refundMethod, status: refundState })
          refundPending = refundState !== 'Refunded' || desiredRefund < record.refundRequired
        } catch (refundError) {
          refundFailure = refundError.message
          refundPending = true
        }
      }
      await refetch()
      setMessage({ type: refundPending ? 'error' : 'success', text: refundFailure ? `${record.returnId} completed, but its refund remains pending: ${refundFailure}` : refundPending ? `${record.returnId} completed. Refund follow-up is still required.` : `${record.returnId} completed and financially settled.` })
      setConfirming(false); setOrderId(''); setProductId(''); setQuantity(1); setRefundAmount(''); idempotencyKey.current = ''
    } catch (caught) { setMessage({ type: 'error', text: caught.message || 'Could not complete the return.' }); setConfirming(false) }
    finally { setSaving(false) }
  }

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }))
  const refreshReturn = async (returnId) => {
    await refetch()
    setSelectedReturn(await returnApi.get(returnId))
  }
  const updateRefundStatus = async (refund, status) => {
    if (saving) return
    setSaving(true); setMessage(null)
    try {
      await returnApi.updateRefund(selectedReturn.returnId, refund.refundId, { status })
      await refreshReturn(selectedReturn.returnId)
      setMessage({ type: 'success', text: `Refund marked ${status.toLowerCase()}.` })
    } catch (caught) { setMessage({ type: 'error', text: caught.message || 'Could not update the refund.' }) }
    finally { setSaving(false) }
  }
  const recordRemainingRefund = async () => {
    if (saving || !selectedReturn?.remainingRefund) return
    setSaving(true); setMessage(null)
    try {
      await returnApi.refund(selectedReturn.returnId, { amount: selectedReturn.remainingRefund, method: refundMethod, status: refundState })
      await refreshReturn(selectedReturn.returnId)
      setMessage({ type: 'success', text: 'Refund transaction recorded.' })
    } catch (caught) { setMessage({ type: 'error', text: caught.message || 'Could not record the refund.' }) }
    finally { setSaving(false) }
  }
  return <section className="returns-page sales-returns-page">
    <div className="products-toolbar"><div><p className="dashboard-kicker">Orders / Sales / Returns</p><h2>Return & Refund Management</h2><p className="products-count">Guided returns with inventory and payment adjustments for {business.name}</p></div><span className="business-filter">{returns.length} returns</span></div>
    {message && <p className={`form-status ${message.type}`} role="status">{message.text}</p>}
    {canCreate && <form className="return-workflow" onSubmit={askConfirmation}>
      <section className="return-step"><header><b>1</b><div><small>Select order</small><h3>Original sales order</h3></div></header><label htmlFor="return-order-search">Search orders</label><input id="return-order-search" value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Order number, invoice or customer" /><label htmlFor="return-order">Completed order *</label><select id="return-order" value={orderId} onChange={(event) => selectOrder(event.target.value)} required><option value="">Select order</option>{visibleOrders.map((entry) => <option key={entry.orderId} value={entry.orderId}>{entry.orderNumber} · {entry.customerName}</option>)}</select>{order && <div className="return-info-grid"><span><small>Order</small><strong>{order.orderNumber}</strong></span><span><small>Customer</small><strong>{order.customerName}</strong></span><span><small>Date</small><strong>{new Date(order.createdAt).toLocaleDateString()}</strong></span><span><small>Total</small><strong>{money(business.currency, order.totalAmount)}</strong></span><span><small>Payment</small><strong>{order.paymentStatus}</strong></span><span><small>Paid</small><strong>{money(business.currency, order.amountPaidActual)}</strong></span><span><small>Outstanding</small><strong>{money(business.currency, order.outstandingActual)}</strong></span><span><small>Method</small><strong>{order.originalPaymentMethods.join(', ') || 'None'}</strong></span></div>}</section>
      <section className={`return-step ${!order ? 'disabled-step' : ''}`}><header><b>2</b><div><small>Select product</small><h3>Sold item</h3></div></header><label htmlFor="return-product">Product *</label><select id="return-product" value={productId} onChange={(event) => { setProductId(event.target.value); setQuantity(1); setRefundAmount('') }} disabled={!order} required><option value="">Select sold product</option>{order?.items.filter((line) => line.returnableQuantity > 0).map((line) => <option key={line.productId} value={line.productId}>{line.productName} ({line.sku})</option>)}</select>{item && <div className="return-selected-product"><strong>{item.productName}</strong><small>{item.sku}{item.size ? ` · Size ${item.size}` : ''}{item.color ? ` · ${item.color}` : ''}</small><p>Sold: {item.quantity} | Already returned: {item.alreadyReturned} | Returnable: {item.returnableQuantity}</p><p>Unit {money(business.currency, item.sellingPrice)} · Discount {money(business.currency, item.discount)} · Tax {money(business.currency, item.tax)}</p></div>}</section>
      <section className={`return-step ${!item ? 'disabled-step' : ''}`}><header><b>3</b><div><small>Return details</small><h3>Quantity, reason and condition</h3></div></header><div className="return-fields"><div><label htmlFor="return-quantity">Quantity *</label><input id="return-quantity" type="number" min={item && ['kg', 'gram', 'litre'].includes(item.unit) ? .001 : 1} step={item && ['kg', 'gram', 'litre'].includes(item.unit) ? .001 : 1} max={item?.returnableQuantity || 1} value={quantity} onChange={(event) => { setQuantity(Number(event.target.value)); setRefundAmount('') }} disabled={!item} required /></div><div><label htmlFor="return-reason">Reason *</label><select id="return-reason" value={reason} onChange={(event) => setReason(event.target.value)} disabled={!item}>{reasons.map((value) => <option key={value}>{value}</option>)}</select></div>{reason === 'Other' && <div className="field-wide"><label htmlFor="return-reason-details">Enter return reason *</label><input id="return-reason-details" value={reasonDetails} onChange={(event) => setReasonDetails(event.target.value)} required /></div>}<div><label htmlFor="return-condition">Condition *</label><select id="return-condition" value={condition} onChange={(event) => setCondition(event.target.value)} disabled={!item}>{conditions.map((value) => <option key={value}>{value}</option>)}</select></div></div>{invalidQuantity && item && <p className="setup-error">Quantity must be positive and cannot exceed {item.returnableQuantity}.</p>}</section>
      <section className={`return-step ${!item || invalidQuantity ? 'disabled-step' : ''}`}><header><b>4</b><div><small>Refund / payment adjustment</small><h3>Financial treatment</h3></div></header><div className="return-financial-grid"><span><small>Order total</small><strong>{money(business.currency, order?.totalAmount)}</strong></span><span><small>Originally paid</small><strong>{money(business.currency, order?.amountPaidActual)}</strong></span><span><small>Outstanding before</small><strong>{money(business.currency, order?.outstandingActual)}</strong></span><span><small>Return value</small><strong>{money(business.currency, returnValue)}</strong></span><span><small>Outstanding adjustment</small><strong>{money(business.currency, outstandingAdjustment)}</strong></span><span className="refund-due"><small>Refund required</small><strong>{money(business.currency, refundRequired)}</strong></span></div>{refundRequired > 0 && canRefund && <div className="return-fields"><div><label htmlFor="refund-method">Refund method</label><select id="refund-method" value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)}>{refundMethods.map((value) => <option key={value}>{value}</option>)}</select></div><div><label htmlFor="refund-amount">Amount</label><input id="refund-amount" type="number" min="0.01" max={refundRequired} step="0.01" value={refundAmount === '' ? refundRequired : refundAmount} readOnly={!canAdjustRefund} onChange={(event) => setRefundAmount(event.target.value)} /></div><div><label htmlFor="refund-state">Initial status</label><select id="refund-state" value={refundState} onChange={(event) => setRefundState(event.target.value)}><option>Pending</option><option>Refunded</option><option>Failed</option></select></div></div>}{refundRequired > 0 && !canRefund && <p className="return-notice">The physical return can be completed, but an authorized user must process the pending refund.</p>}</section>
      <section className={`return-step return-review ${!item || invalidQuantity ? 'disabled-step' : ''}`}><header><b>5</b><div><small>Review & confirm</small><h3>Return summary</h3></div></header>{item && <div className="return-review-grid"><div><small>Order / Customer</small><strong>{order.orderNumber} · {order.customerName}</strong></div><div><small>Product / Quantity</small><strong>{item.productName} · {quantity}</strong></div><div><small>Reason / Condition</small><strong>{reason}{reasonDetails ? ` — ${reasonDetails}` : ''} · {condition}</strong></div><div><small>Payment adjustment</small><strong>{money(business.currency, outstandingAdjustment)} balance · {money(business.currency, refundRequired)} refund</strong></div><div><small>Inventory action</small><strong>{condition === 'Sellable' ? `Return ${quantity} to available inventory` : `Move ${quantity} to ${condition.toLowerCase()} / non-sellable stock`}</strong></div></div>}<button className="submit-button return-confirm-button" type="submit" disabled={!item || invalidQuantity || saving}>Review return <span>→</span></button></section>
    </form>}

    <div className="section-heading return-history-heading"><div><p className="dashboard-kicker">Audit history</p><h2>Sales returns</h2></div></div>
    <div className="return-filters"><input aria-label="Search returns" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Return ID, order, product, SKU or customer" /><select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="all">All return statuses</option><option>Pending</option><option>Completed</option><option>Cancelled</option></select><select value={filters.refundStatus} onChange={(event) => updateFilter('refundStatus', event.target.value)}><option value="all">All refund statuses</option><option>Not Required</option><option>Pending</option><option>Partially Refunded</option><option>Refunded</option><option>Failed</option><option>Cancelled</option></select><select value={filters.reason} onChange={(event) => updateFilter('reason', event.target.value)}><option value="all">All reasons</option>{reasons.map((value) => <option key={value}>{value}</option>)}</select><select value={filters.condition} onChange={(event) => updateFilter('condition', event.target.value)}><option value="all">All conditions</option>{conditions.map((value) => <option key={value}>{value}</option>)}</select><select value={filters.refundMethod} onChange={(event) => updateFilter('refundMethod', event.target.value)}><option value="all">All refund methods</option>{refundMethods.map((value) => <option key={value}>{value}</option>)}</select><input type="date" aria-label="Returns from date" value={filters.dateFrom} onChange={(event) => updateFilter('dateFrom', event.target.value)} /><input type="date" aria-label="Returns to date" value={filters.dateTo} onChange={(event) => updateFilter('dateTo', event.target.value)} /></div>
    <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!filteredReturns.length} emptyText={returns.length ? 'No returns match these filters.' : 'No sales returns recorded yet.'}><div className="return-history-list">{filteredReturns.map((record) => <button type="button" key={record.returnId} onClick={() => setSelectedReturn(record)}><span><strong>{record.returnId}</strong><small>{record.orderNumber} · {record.customerName}</small></span><span><strong>{record.productName}</strong><small>{record.productSku} · {record.quantity} units</small></span><span><strong>{money(business.currency, record.returnValue || record.refundAmount)}</strong><small>{record.reason} · {record.condition || 'Legacy return'}</small></span><span><em className={`status-badge ${record.refundStatus === 'Refunded' ? 'active' : 'inactive'}`}>{record.refundStatus || 'Not Required'}</em><small>{record.status} · {new Date(record.createdAt).toLocaleDateString()}</small></span></button>)}</div></AsyncBoundary>

    {confirming && <div className="supplier-modal-backdrop return-dialog-backdrop"><div className="supplier-modal return-dialog" role="dialog" aria-modal="true" aria-labelledby="return-confirm-title"><div className="product-form-heading"><div><p className="dashboard-kicker">Final confirmation</p><h3 id="return-confirm-title">Complete this return?</h3></div></div><p>{quantity} × {item.productName} will be recorded as {condition.toLowerCase()}.</p><div className="return-dialog-impact"><span>Inventory<strong>{condition === 'Sellable' ? 'Available stock increases' : 'Non-sellable stock increases'}</strong></span><span>Outstanding adjustment<strong>{money(business.currency, outstandingAdjustment)}</strong></span><span>Refund required<strong>{money(business.currency, refundRequired)}</strong></span></div><p className="return-notice">Refund records are internal workflow records. No UPI, card, or bank gateway will be contacted.</p><div className="product-form-actions"><button className="outline-button" type="button" disabled={saving} onClick={() => setConfirming(false)}>Cancel</button><button className="submit-button" type="button" disabled={saving} onClick={confirm}>{saving ? 'Processing…' : 'Confirm return'}</button></div></div></div>}
    {selectedReturn && <div className="supplier-modal-backdrop return-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedReturn(null)}><div className="supplier-modal return-detail-dialog" role="dialog" aria-modal="true"><div className="product-form-heading"><div><p className="dashboard-kicker">Return details</p><h3>{selectedReturn.returnId}</h3></div><button className="close-button" type="button" onClick={() => setSelectedReturn(null)}>×</button></div><div className="return-detail-grid">{[['Order', selectedReturn.orderNumber], ['Customer', selectedReturn.customerName], ['Product', `${selectedReturn.productName} (${selectedReturn.productSku || 'No SKU'})`], ['Quantity', selectedReturn.quantity], ['Return value', money(business.currency, selectedReturn.returnValue || selectedReturn.refundAmount)], ['Reason', `${selectedReturn.reason}${selectedReturn.reasonDetails ? ` — ${selectedReturn.reasonDetails}` : ''}`], ['Condition', selectedReturn.condition || 'Legacy return'], ['Inventory', selectedReturn.inventoryAction || 'sellable'], ['Outstanding adjusted', money(business.currency, selectedReturn.outstandingAdjustment)], ['Refunded', money(business.currency, selectedReturn.refundAmount)], ['Remaining refund', money(business.currency, selectedReturn.remainingRefund)], ['Refund status', selectedReturn.refundStatus || 'Not Required'], ['Return status', selectedReturn.status], ['Processed by', selectedReturn.processedBy], ['Date', new Date(selectedReturn.createdAt).toLocaleString()]].map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>{selectedReturn.refunds?.length > 0 && <div className="refund-history"><h4>Refund transactions</h4>{selectedReturn.refunds.map((refund) => <article key={refund.refundId}><span><strong>{money(business.currency, refund.amount)}</strong><small>{refund.resolvedMethod || refund.method}</small></span><em>{refund.status}</em>{canRefund && ['Pending', 'Failed'].includes(refund.status) && <span className="product-actions"><button type="button" disabled={saving} onClick={() => updateRefundStatus(refund, 'Refunded')}>{refund.status === 'Failed' ? 'Retry as refunded' : 'Mark refunded'}</button>{refund.status === 'Pending' && <button type="button" disabled={saving} onClick={() => updateRefundStatus(refund, 'Failed')}>Mark failed</button>}</span>}</article>)}</div>}{canRefund && selectedReturn.remainingRefund > 0 && !selectedReturn.refunds?.some((refund) => refund.status === 'Pending') && <div className="refund-followup"><h4>Process remaining refund</h4><select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)}>{refundMethods.map((value) => <option key={value}>{value}</option>)}</select><select value={refundState} onChange={(event) => setRefundState(event.target.value)}><option>Pending</option><option>Refunded</option><option>Failed</option></select><button className="submit-button" type="button" disabled={saving} onClick={recordRemainingRefund}>{saving ? 'Processing…' : `Record ${money(business.currency, selectedReturn.remainingRefund)}`}</button></div>}</div></div>}
  </section>
}
