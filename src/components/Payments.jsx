import { useCallback, useState } from 'react'
import { paymentApi } from '../api/paymentApi.js'
import { salesOrderApi } from '../api/salesOrderApi.js'
import { purchaseOrderApi } from '../api/purchaseOrderApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'

function Payments({ business }) {
  const load = useCallback(() => Promise.all([paymentApi.list(), salesOrderApi.list(), purchaseOrderApi.list()]), [])
  const { data, loading, error, refetch, setData } = useResource(load, [], [[], [], []])
  const [payments, salesOrders, purchaseOrders] = data

  const [type, setType] = useState('sale')
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)
  const orders = type === 'sale' ? salesOrders : purchaseOrders
  const getPaid = (referenceId) => payments.filter((payment) => payment.referenceId === referenceId).reduce((sum, payment) => sum + payment.amount, 0)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    const form = event.currentTarget
    const data = new FormData(form)
    const referenceId = data.get('referenceId')
    const order = orders.find((item) => item.orderId === referenceId || item.purchaseOrderId === referenceId)
    const amount = Number(data.get('amount'))
    const paid = getPaid(referenceId)
    if (!order || !amount || amount <= 0 || paid + amount > order.totalAmount) {
      setMessage({ type: 'error', text: 'Enter a valid payment that does not exceed the outstanding balance.' })
      return
    }
    setSaving(true)
    try {
      await paymentApi.create({
        type,
        referenceId,
        amount,
        paymentMethod: data.get('paymentMethod'),
        paymentDate: data.get('paymentDate'),
        notes: data.get('notes').trim(),
      })
      const [freshPayments, freshSales, freshPurchases] = await Promise.all([paymentApi.list(), salesOrderApi.list(), purchaseOrderApi.list()])
      setData([freshPayments, freshSales, freshPurchases])
      setMessage({ type: 'success', text: `${business.currency} ${amount.toFixed(2)} payment recorded.` })
      form.reset()
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not record the payment.' })
    } finally {
      setSaving(false)
    }
  }

  return <section className="payments-page"><div className="products-toolbar"><div><p className="dashboard-kicker">Orders / Sales / Payments</p><h2>Payments</h2><p className="products-count">Record payments for {business.name}</p></div><div className="payment-type-switch"><button className={type === 'sale' ? 'active' : ''} type="button" onClick={() => setType('sale')}>Sales</button><button className={type === 'purchase' ? 'active' : ''} type="button" onClick={() => setType('purchase')}>Purchases</button></div></div>{message && <p className={`form-status ${message.type}`}>{message.text}</p>}<form className="payment-form" onSubmit={handleSubmit}><div><label htmlFor="payment-reference">Order *</label><select id="payment-reference" name="referenceId" defaultValue="" required><option value="" disabled>Select {type} order</option>{orders.map((order) => { const id = order.orderId || order.purchaseOrderId; const label = order.orderNumber || id; const outstanding = order.totalAmount - getPaid(id); return <option key={id} value={id}>{label} · {type === 'sale' ? order.customerName : order.supplierName} · Due {business.currency} {outstanding.toFixed(2)}</option> })}</select></div><div><label htmlFor="payment-amount">Amount *</label><input id="payment-amount" name="amount" type="number" min="0.01" step="0.01" required /></div><div><label htmlFor="payment-method">Payment method</label><select id="payment-method" name="paymentMethod" defaultValue="Cash"><option>Cash</option><option>UPI</option><option>Card</option><option>Bank transfer</option><option>Credit</option><option>Other</option></select></div><div><label htmlFor="payment-date">Payment date</label><input id="payment-date" name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div><div className="field-wide"><label htmlFor="payment-notes">Notes</label><input id="payment-notes" name="notes" placeholder="Payment reference or notes" /></div><button className="submit-button" type="submit" disabled={saving}>{saving ? 'Recording…' : 'Record payment'} <span>→</span></button></form><div className="payment-summary-row"><article><small>Sales payments</small><strong>{business.currency} {payments.filter((payment) => payment.type === 'sale').reduce((sum, payment) => sum + payment.amount, 0).toFixed(2)}</strong></article><article><small>Purchase payments</small><strong>{business.currency} {payments.filter((payment) => payment.type === 'purchase').reduce((sum, payment) => sum + payment.amount, 0).toFixed(2)}</strong></article><article><small>Payment records</small><strong>{payments.length}</strong></article></div><AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!payments.length} emptyText="No payments recorded for this business yet."><div className="history-list"><div className="payment-history-head">Payment history</div>{payments.map((payment) => <div className="history-row" key={payment.paymentId}><span className={`history-type ${payment.type === 'sale' ? 'stock_in' : 'stock_out'}`}>{payment.type}</span><span><strong>{payment.referenceId}</strong><small>{payment.paymentMethod} · {payment.paymentDate} · by {payment.recordedBy}</small></span><span className="history-quantity">{business.currency} {payment.amount.toFixed(2)}</span></div>)}</div></AsyncBoundary></section>
}

export default Payments
