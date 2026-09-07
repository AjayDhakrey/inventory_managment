import { useCallback, useMemo, useState } from 'react'
import { paymentApi } from '../api/paymentApi.js'
import { salesOrderApi } from '../api/salesOrderApi.js'
import { purchaseOrderApi } from '../api/purchaseOrderApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'
import '../styles/payments.css'

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const METHODS = ['Cash', 'UPI', 'Card', 'Bank transfer', 'Credit', 'Other']
const MODE_TABS = [
  { id: 'all', label: 'All modes', match: () => true },
  { id: 'UPI', label: 'UPI', match: (p) => p.paymentMethod === 'UPI' },
  { id: 'Cash', label: 'Cash', match: (p) => p.paymentMethod === 'Cash' },
  { id: 'Card', label: 'Card', match: (p) => /card/i.test(p.paymentMethod) },
  { id: 'Bank', label: 'Bank', match: (p) => /bank/i.test(p.paymentMethod) },
]

function PayIcon({ name }) {
  const paths = {
    in: <><path d="M12 3v11m-4-4 4 4 4-4" /><path d="M4 17v3h16v-3" /></>,
    out: <><path d="M12 21V10m-4 4 4-4 4 4" /><path d="M4 4v3h16V4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    drawer: <><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M7 8V5h10v3M9 14h6" /></>,
    arrow: <path d="M5 12h13m-5-5 5 5-5 5" />,
    export: <><path d="M12 3v12m-4-4 4 4 4-4" /><path d="M5 17v3h14v-3" /></>,
    print: <><path d="M7 8V3h10v5M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function Payments({ business, account }) {
  const load = useCallback(() => Promise.all([paymentApi.list(), salesOrderApi.list(), purchaseOrderApi.list()]), [])
  const { data, loading, error, refetch, setData } = useResource(load, [], [[], [], []])
  const [payments, salesOrders, purchaseOrders] = data

  const [type, setType] = useState('sale')
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('all')
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)

  const currency = business.currency || 'INR'
  const money = (value, dp = 2) => {
    const n = Number(value || 0)
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n)
    } catch {
      return `${currency} ${n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
    }
  }

  const orders = type === 'sale' ? salesOrders : purchaseOrders
  const getPaid = useCallback((referenceId) => payments.filter((payment) => payment.referenceId === referenceId).reduce((sum, payment) => sum + Number(payment.amount || 0), 0), [payments])
  const orderName = (referenceId) => {
    const sale = salesOrders.find((order) => order.orderId === referenceId)
    if (sale) return { entity: sale.customerName || 'Walk-in customer', ref: sale.orderNumber, gstin: sale.customerSnapshot?.gstin }
    const po = purchaseOrders.find((order) => order.purchaseOrderId === referenceId)
    if (po) return { entity: po.supplierName || 'Vendor', ref: po.orderNumber }
    return { entity: referenceId, ref: '' }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    const form = event.currentTarget
    const formData = new FormData(form)
    const referenceId = formData.get('referenceId')
    const order = orders.find((item) => item.orderId === referenceId || item.purchaseOrderId === referenceId)
    const value = Number(formData.get('amount'))
    const paid = getPaid(referenceId)
    if (!order || !value || value <= 0 || paid + value > order.totalAmount + 0.01) {
      setMessage({ type: 'error', text: 'Enter a valid payment that does not exceed the outstanding balance.' })
      return
    }
    setSaving(true)
    try {
      await paymentApi.create({
        type,
        referenceId,
        amount: value,
        paymentMethod: formData.get('paymentMethod'),
        paymentDate: formData.get('paymentDate'),
        notes: formData.get('notes').trim(),
      })
      const [freshPayments, freshSales, freshPurchases] = await Promise.all([paymentApi.list(), salesOrderApi.list(), purchaseOrderApi.list()])
      setData([freshPayments, freshSales, freshPurchases])
      setMessage({ type: 'success', text: `${money(value)} payment recorded and posted to the ledger.` })
      setAmount('')
      form.reset()
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not record the payment.' })
    } finally {
      setSaving(false)
    }
  }

  const stats = useMemo(() => {
    const today = startOfToday()
    const yesterday = new Date(today.getTime() - 864e5)
    const isToday = (payment) => new Date(payment.paymentDate || payment.createdAt) >= today
    const salesToday = payments.filter((payment) => payment.type === 'sale' && isToday(payment)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const salesYesterday = payments.filter((payment) => { if (payment.type !== 'sale') return false; const at = new Date(payment.paymentDate || payment.createdAt); return at >= yesterday && at < today }).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const purchasePayments = payments.filter((payment) => payment.type === 'purchase')
    const purchasesOut = purchasePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const vendorCount = new Set(purchasePayments.map((payment) => payment.referenceId)).size
    const dues = salesOrders.filter((order) => order.status !== 'Cancelled').map((order) => Number(order.totalAmount || 0) - getPaid(order.orderId)).filter((value) => value > 0.5)
    const cashToday = payments.filter((payment) => payment.paymentMethod === 'Cash' && payment.type === 'sale' && isToday(payment)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    return {
      salesToday,
      salesTxns: payments.filter((payment) => payment.type === 'sale' && isToday(payment)).length,
      salesDelta: salesYesterday ? Math.round(((salesToday - salesYesterday) / salesYesterday) * 100) : null,
      purchasesOut,
      vendorCount,
      duesTotal: dues.reduce((sum, value) => sum + value, 0),
      duesCount: dues.length,
      cashDrawer: cashToday,
    }
  }, [payments, salesOrders, getPaid])

  const visiblePayments = useMemo(() => {
    const matchMode = MODE_TABS.find((option) => option.id === mode)?.match || (() => true)
    return payments.filter(matchMode)
  }, [payments, mode])

  const exportCsv = () => {
    const escapeCell = (value) => { const t = String(value ?? ''); const s = /^[=+@\-\t\r]/.test(t) ? `'${t}` : t; return `"${s.replaceAll('"', '""')}"` }
    const rows = [
      ['Receipt', 'Type', 'Entity', 'Ref order', 'Method', 'Reference note', 'Amount', 'Date'],
      ...visiblePayments.map((payment) => {
        const info = orderName(payment.referenceId)
        return [payment.paymentId?.slice(-8).toUpperCase(), payment.type, info.entity, info.ref, payment.paymentMethod, payment.transactionReference || payment.notes, payment.amount, payment.paymentDate || new Date(payment.createdAt).toLocaleDateString('en-GB')]
      }),
    ]
    const url = URL.createObjectURL(new Blob([rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const methodTone = (method) => /upi/i.test(method) ? 'blue' : /cash/i.test(method) ? 'green' : /card/i.test(method) ? 'amber' : 'dim'

  return <section className="pay-page" aria-labelledby="pay-title">
    <header className="pay-heading">
      <div>
        <p className="pay-kicker">Terminal <span>•</span> Payments &amp; settlement control</p>
        <div className="pay-title-line">
          <h1 id="pay-title">Payments Management</h1>
          <span className="pay-online">Counter #01 online</span>
        </div>
        <p>Record customer sales inflows, manage vendor disbursements, and view the real-time settlement ledger.</p>
      </div>
      <div className="pay-type-switch">
        <button type="button" className={type === 'sale' ? 'active' : ''} onClick={() => setType('sale')}>Sales payments<b>{payments.filter((payment) => payment.type === 'sale').length}</b></button>
        <button type="button" className={type === 'purchase' ? 'active' : ''} onClick={() => setType('purchase')}>Vendor outflow<b>{payments.filter((payment) => payment.type === 'purchase').length}</b></button>
      </div>
    </header>

    {message && <p className={`pay-message ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}

    <div className="pay-kpis" aria-busy={loading}>
      <article className="pay-kpi">
        <span>Sales collections today <i className="green"><PayIcon name="in" /></i></span>
        <strong className="pay-money">{loading || error ? '—' : money(stats.salesToday)}</strong>
        <p>{stats.salesDelta !== null && <b className={stats.salesDelta >= 0 ? 'up' : 'down'}>{stats.salesDelta >= 0 ? '+' : ''}{stats.salesDelta}% vs yesterday</b>} · {stats.salesTxns} transactions</p>
      </article>
      <article className="pay-kpi">
        <span>Purchases paid out <i className="amber"><PayIcon name="out" /></i></span>
        <strong className="pay-money">{loading || error ? '—' : money(stats.purchasesOut)}</strong>
        <p>Across {stats.vendorCount} vendor{stats.vendorCount === 1 ? '' : 's'}</p>
      </article>
      <article className={`pay-kpi${stats.duesTotal > 0 ? ' pay-kpi-alert' : ''}`}>
        <span>Outstanding dues <i className="rose"><PayIcon name="clock" /></i></span>
        <strong className="pay-money pay-due">{loading || error ? '—' : money(stats.duesTotal)}</strong>
        <p>{stats.duesCount} pending credit account{stats.duesCount === 1 ? '' : 's'}</p>
      </article>
      <article className="pay-kpi">
        <span>Cash drawer (today) <i className="blue"><PayIcon name="drawer" /></i></span>
        <strong className="pay-money">{loading || error ? '—' : money(stats.cashDrawer)}</strong>
        <p>Counter register #01 · cash sales collected</p>
      </article>
    </div>

    <form className="pay-form" onSubmit={handleSubmit}>
      <div className="pay-form-head">
        <div><span className="pay-form-dot" /><strong>Record payment &amp; settle invoice</strong><em>Quick terminal entry</em></div>
        <span className="pay-form-note">Entries instantly update ledgers and release inventory holds.</span>
      </div>
      <div className="pay-form-grid">
        <label className="pay-field">
          <span>Select {type === 'sale' ? 'sale order / invoice' : 'purchase order'} <b>*</b></span>
          <select name="referenceId" defaultValue="" required>
            <option value="" disabled>Select {type} order…</option>
            {orders.map((order) => {
              const id = order.orderId || order.purchaseOrderId
              const outstanding = Number(order.totalAmount || 0) - getPaid(id)
              return <option key={id} value={id}>{order.orderNumber || id} · {type === 'sale' ? order.customerName : order.supplierName} · due {money(outstanding, 0)}</option>
            })}
          </select>
          <small>Only orders with an open balance can take a payment.</small>
        </label>
        <label className="pay-field">
          <span>Amount received <b>*</b></span>
          <input name="amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required />
          <div className="pay-quick">{[1000, 2000, 5000].map((quick) => <button type="button" key={quick} onClick={() => setAmount(String(quick))}>{money(quick, 0)}</button>)}</div>
        </label>
        <label className="pay-field">
          <span>Payment method <b>*</b></span>
          <select name="paymentMethod" defaultValue="UPI">{METHODS.map((method) => <option key={method}>{method}</option>)}</select>
          <small>UPI &amp; bank transfers settle instantly with zero fee.</small>
        </label>
        <label className="pay-field">
          <span>Payment date <b>*</b></span>
          <input name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          <small>Defaults to the active register timestamp.</small>
        </label>
        <label className="pay-field pay-field-wide">
          <span>Payment reference / transaction ID / notes</span>
          <input name="notes" placeholder="e.g. UPI-HDFC-9940291482" />
        </label>
        <button className="pay-submit" type="submit" disabled={saving}>{saving ? 'Recording…' : 'Record payment'}<PayIcon name="arrow" /></button>
      </div>
    </form>

    <section className="pay-ledger">
      <div className="pay-ledger-head">
        <div>
          <h2>Payment history &amp; settlement ledger</h2>
          <p>Chronological audit trail of customer payments and vendor settlements.</p>
        </div>
        <div className="pay-ledger-tools">
          <div className="pay-modes">{MODE_TABS.map((option) => <button type="button" key={option.id} className={mode === option.id ? 'active' : ''} onClick={() => setMode(option.id)}>{option.label}</button>)}</div>
          <button type="button" className="pay-tool" onClick={exportCsv} disabled={!payments.length}><PayIcon name="export" />Export</button>
          <button type="button" className="pay-tool" onClick={() => window.print()}><PayIcon name="print" />Print sheet</button>
        </div>
      </div>
      <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!visiblePayments.length} emptyText={payments.length ? 'No payments in this mode.' : 'No payments recorded yet. Settle an invoice above to start the ledger.'}>
        <div className="pay-table-scroll" tabIndex={0} role="region" aria-label="Payment ledger">
          <table className="pay-table">
            <thead><tr>
              <th>Receipt # / timestamp</th><th>Entity</th><th>Ref order</th><th>Method</th><th>Reference note</th>
              <th className="num">Amount</th><th>Status</th>
            </tr></thead>
            <tbody>
              {visiblePayments.map((payment) => {
                const info = orderName(payment.referenceId)
                return <tr key={payment.paymentId}>
                  <td>
                    <strong className="pay-receipt">RCP-{payment.paymentId?.slice(-6).toUpperCase()}</strong>
                    <small>{new Date(payment.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
                  </td>
                  <td>
                    <strong>{info.entity}</strong>
                    <small>{info.gstin ? `GSTIN ${info.gstin}` : payment.recordedBy || (payment.type === 'sale' ? 'Counter sale' : 'Vendor settlement')}</small>
                  </td>
                  <td>{info.ref ? <span className="pay-ref-chip">{info.ref}</span> : <span className="pay-dim">—</span>}</td>
                  <td><span className={`pay-badge ${methodTone(payment.paymentMethod)}`}>{payment.paymentMethod}</span></td>
                  <td><span className="pay-note">{payment.transactionReference || payment.notes || '—'}</span></td>
                  <td className={`num pay-amount ${payment.type === 'sale' ? 'plus' : 'minus'}`}>{payment.type === 'sale' ? '+ ' : '− '}{money(payment.amount)}</td>
                  <td><span className="pay-badge green"><i />Settled</span></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </AsyncBoundary>
    </section>

    <footer className="pay-statusbar">
      <span><i />Stockroom OS · settlement control</span>
      <span>Cashier: {account?.name || account?.email || 'Operator'}</span>
      <span>{visiblePayments.length} of {payments.length} ledger entries</span>
      <span className="pay-statusbar-suite">Enterprise Retail OS</span>
    </footer>
  </section>
}

export default Payments
