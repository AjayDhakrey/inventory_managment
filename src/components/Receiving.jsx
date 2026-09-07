import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { receivingApi } from '../api/receivingApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'
import '../styles/receiving.css'

function GrnIcon({ name }) {
  const paths = {
    inbound: <><path d="M12 3v11m-4-4 4 4 4-4" /><path d="M4 17v3h16v-3" /></>,
    export: <><path d="M12 3v12m-4-4 4 4 4-4" /><path d="M5 17v3h14v-3" /></>,
    scan: <><path d="M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3" /><path d="M4 12h16" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8.4 12 2.4 2.4 4.8-5.4" /></>,
    box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="M4 7.5 12 12m0 9V12m8-4.5L12 12" /></>,
    gauge: <><path d="M12 13 16 9" /><path d="M4 18a8 8 0 1 1 16 0" /></>,
    clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3h6v1M9 11h6M9 15h4" /></>,
    arrow: <path d="M4 12h15m-5-5 5 5-5 5" />,
    minus: <path d="M5 12h14" />,
    plus: <path d="M12 5v14M5 12h14" />,
    printer: <><path d="M7 8V3h10v5M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const DOCK_BAYS = ['Bay 01 - Ambient', 'Bay 02 - Cold storage', 'Bay 03 - Bulk / pallet', 'Bay 04 - Returns dock']
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

function Receiving({ business, account, onNavigate }) {
  const load = useCallback(() => Promise.all([receivingApi.pendingOrders(), receivingApi.list()]), [])
  const { data, loading, error, refetch, setData } = useResource(load, [], [[], []])
  const [pendingOrders, receivings] = data

  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [lines, setLines] = useState([])
  const [challan, setChallan] = useState('')
  const [dockBay, setDockBay] = useState(DOCK_BAYS[0])
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)
  const orderSelectRef = useRef(null)

  const currency = business.currency || 'INR'
  const money = (value, dp = 2) => {
    const amount = Number(value || 0)
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: dp, maximumFractionDigits: dp }).format(amount)
    } catch {
      return `${currency} ${amount.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
    }
  }

  const selectedOrder = pendingOrders.find((order) => order.purchaseOrderId === selectedOrderId)

  const buildLines = (order) => order.lines.map((line) => ({
    productId: line.productId,
    productName: line.productName,
    variantSku: line.variantSku || '',
    orderedQuantity: line.orderedQuantity,
    alreadyReceived: line.alreadyReceived,
    receivedQuantity: Math.max(0, line.orderedQuantity - line.alreadyReceived),
    damagedQuantity: 0,
    rejectedQuantity: 0,
    batchNumber: '',
    expiryDate: '',
  }))

  const selectOrder = (orderId) => {
    const order = pendingOrders.find((item) => item.purchaseOrderId === orderId)
    setSelectedOrderId(orderId)
    setMessage(null)
    setLines(order ? buildLines(order) : [])
  }
  const updateLine = (index, field, value) => setLines(lines.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line))
  const stepQty = (index, delta) => setLines(lines.map((line, lineIndex) => {
    if (lineIndex !== index) return line
    const remaining = line.orderedQuantity - line.alreadyReceived
    return { ...line, receivedQuantity: Math.max(0, Math.min(remaining, Number(line.receivedQuantity || 0) + delta)) }
  }))
  const acceptAllAsOrdered = () => selectedOrder && setLines(lines.map((line) => ({ ...line, receivedQuantity: line.orderedQuantity - line.alreadyReceived, damagedQuantity: 0, rejectedQuantity: 0 })))

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    if (!selectedOrder) { setMessage({ type: 'error', text: 'Select a purchase order first.' }); return }
    const invalid = lines.find((line) => {
      const remaining = line.orderedQuantity - line.alreadyReceived
      return Number(line.receivedQuantity) < 0 || Number(line.receivedQuantity) > remaining || Number(line.damagedQuantity) < 0 || Number(line.rejectedQuantity) < 0 || Number(line.damagedQuantity) + Number(line.rejectedQuantity) > Number(line.receivedQuantity)
    })
    if (invalid) { setMessage({ type: 'error', text: 'Check received quantities. They cannot exceed the remaining ordered quantity, and damaged/rejected quantities cannot exceed received quantity.' }); return }

    setSaving(true)
    try {
      const userNotes = (new FormData(event.currentTarget).get('notes') || '').trim()
      const context = [challan.trim() && `Challan ${challan.trim()}`, dockBay].filter(Boolean).join(' · ')
      const payload = {
        purchaseOrderId: selectedOrder.purchaseOrderId,
        notes: [context, userNotes].filter(Boolean).join(' — '),
        items: lines.map((line) => ({
          productId: line.productId,
          receivedQuantity: Number(line.receivedQuantity),
          damagedQuantity: Number(line.damagedQuantity),
          rejectedQuantity: Number(line.rejectedQuantity),
          batchNumber: line.batchNumber.trim(),
          expiryDate: line.expiryDate,
        })),
      }
      const receiving = await receivingApi.create(payload)
      const [freshPending, freshHistory] = await Promise.all([receivingApi.pendingOrders(), receivingApi.list()])
      setData([freshPending, freshHistory])
      setSelectedOrderId('')
      setLines([])
      setChallan('')
      setMessage({ type: 'success', text: `GRN ${receiving.receivingId} posted. Accepted stock was added to inventory.` })
      event.currentTarget.reset()
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not record the receiving.' })
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const handler = (event) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return
      if (event.key === 'F2') { event.preventDefault(); orderSelectRef.current?.focus() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const stats = useMemo(() => {
    const today = startOfToday()
    const remainingUnits = pendingOrders.reduce((sum, order) => sum + order.lines.reduce((n, line) => n + Math.max(0, line.orderedQuantity - line.alreadyReceived), 0), 0)
    const uniqueSkus = new Set(pendingOrders.flatMap((order) => order.lines.map((line) => line.productId))).size
    const expectedValue = pendingOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)
    const lateTrucks = pendingOrders.filter((order) => order.expectedDeliveryDate && new Date(order.expectedDeliveryDate) < today).length
    const allItems = receivings.flatMap((receiving) => receiving.items)
    const received = allItems.reduce((sum, item) => sum + Number(item.receivedQuantity || 0), 0)
    const accepted = allItems.reduce((sum, item) => sum + Number(item.acceptedQuantity || 0), 0)
    const rejected = allItems.reduce((sum, item) => sum + Number(item.rejectedQuantity || 0) + Number(item.damagedQuantity || 0), 0)
    const todayReceivings = receivings.filter((receiving) => new Date(receiving.receivedAt) >= today)
    const acceptedToday = todayReceivings.flatMap((receiving) => receiving.items).reduce((sum, item) => sum + Number(item.acceptedQuantity || 0), 0)
    const days = new Set(receivings.map((receiving) => new Date(receiving.receivedAt).toDateString())).size || 1
    const avgPerDay = receivings.length / days
    const deltaVsAvg = avgPerDay ? Math.round(((todayReceivings.length - avgPerDay) / avgPerDay) * 100) : null
    return {
      pendingCount: pendingOrders.length,
      lateTrucks,
      remainingUnits,
      uniqueSkus,
      expectedValue,
      passRate: received ? (accepted / received) * 100 : 100,
      rejected,
      inspectedReceipts: receivings.length,
      completedToday: todayReceivings.length,
      acceptedToday,
      deltaVsAvg,
    }
  }, [pendingOrders, receivings])

  const currentStep = selectedOrder ? 2 : 1
  const STEPS = [
    { n: 1, title: 'Select PO', hint: 'Choose supplier order & dock bay' },
    { n: 2, title: 'Check & scan items', hint: 'Count boxes, verify batch & expiry' },
    { n: 3, title: 'Post to stock', hint: 'Generate GRN & update inventory' },
  ]

  const lineStatus = (line) => {
    const remaining = line.orderedQuantity - line.alreadyReceived
    const received = Number(line.receivedQuantity || 0)
    const flagged = Number(line.damagedQuantity || 0) + Number(line.rejectedQuantity || 0)
    if (received === 0) return { label: 'Not checked', tone: 'dim' }
    if (flagged > 0) return { label: 'Damage logged', tone: 'rose' }
    if (received < remaining) return { label: 'Short receipt', tone: 'amber' }
    return { label: 'All good · verified', tone: 'green' }
  }

  const exportCsv = () => {
    const escapeCell = (value) => {
      const text = String(value ?? '')
      const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text
      return `"${safe.replaceAll('"', '""')}"`
    }
    const rows = [
      ['GRN', 'Purchase Order', 'Products', 'Received', 'Accepted', 'Damaged', 'Rejected', 'Received At', 'Received By'],
      ...receivings.map((receiving) => [
        receiving.receivingId,
        receiving.purchaseOrderId,
        receiving.items.length,
        receiving.items.reduce((sum, item) => sum + Number(item.receivedQuantity || 0), 0),
        receiving.items.reduce((sum, item) => sum + Number(item.acceptedQuantity || 0), 0),
        receiving.items.reduce((sum, item) => sum + Number(item.damagedQuantity || 0), 0),
        receiving.items.reduce((sum, item) => sum + Number(item.rejectedQuantity || 0), 0),
        new Date(receiving.receivedAt).toLocaleString('en-GB'),
        receiving.receivedBy,
      ]),
    ]
    const url = URL.createObjectURL(new Blob([rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `grn-history-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const visibleHistory = receivings.filter((receiving) => `${receiving.receivingId} ${receiving.purchaseOrderId} ${receiving.supplierId}`.toLowerCase().includes(search.toLowerCase()))

  return <section className="grn-page" aria-labelledby="grn-title">
    <header className="grn-heading">
      <div>
        <p className="grn-kicker">Manage your inward logistics <span>•</span> Dock &amp; GRN control</p>
        <div className="grn-title-line">
          <h1 id="grn-title">Receiving &amp; Inward Goods Inspection</h1>
          <span className="grn-awaiting">{stats.pendingCount} awaiting unload</span>
        </div>
        <p>Inspect deliveries against active purchase orders, verify vendor challans, audit expiry dates, and commit Goods Received Notes directly to inventory.</p>
      </div>
      <div className="grn-heading-actions">
        <button type="button" onClick={() => onNavigate?.('Stock In')}><GrnIcon name="inbound" />Direct inward (No PO)</button>
        <button type="button" onClick={exportCsv} disabled={loading || !!error || !receivings.length}><GrnIcon name="export" />Export GRN CSV</button>
        <button type="button" className="primary" onClick={() => orderSelectRef.current?.focus()}><GrnIcon name="scan" />Scan waybill<kbd>F2</kbd></button>
      </div>
    </header>

    {message && <p className={`grn-message ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}

    <div className="grn-workflow">
      <div className="grn-workflow-head">
        <span className="grn-workflow-tag">Workflow guide</span>
        <strong>Floor receiving in 3 easy steps</strong>
        <em>Currently at step {currentStep}: {STEPS[currentStep - 1].title}</em>
      </div>
      <div className="grn-steps">
        {STEPS.map((step) => {
          const state = step.n < currentStep ? 'done' : step.n === currentStep ? 'active' : 'todo'
          return <div className={`grn-step ${state}`} key={step.n}>
            <span className="grn-step-mark">{state === 'done' ? '✓' : step.n}</span>
            <div>
              <strong>Step {step.n}: {step.title}{state === 'done' ? ' · done' : state === 'active' ? ' · active' : ''}</strong>
              <small>{step.hint}</small>
            </div>
          </div>
        })}
      </div>
      <p className="grn-terms"><b>?</b> Quick terms: <strong>PO</strong> = Purchase Order · <strong>GRN</strong> = Goods Received Note · <strong>Challan</strong> = vendor delivery slip</p>
    </div>

    <div className="grn-kpis" aria-busy={loading}>
      <article className="grn-kpi">
        <span>Pending Deliveries <GrnIcon name="inbound" /></span>
        <strong>{loading || error ? '—' : stats.pendingCount} <small>open POs</small></strong>
        <p>{stats.lateTrucks > 0 ? `${stats.lateTrucks} past ETA · ` : ''}{Math.max(0, stats.pendingCount - stats.lateTrucks)} on schedule</p>
        <div className="grn-meter blue"><i style={{ width: `${stats.pendingCount ? Math.round(((stats.pendingCount - stats.lateTrucks) / stats.pendingCount) * 100) : 0}%` }} /></div>
      </article>
      <article className="grn-kpi">
        <span>Items to Check <GrnIcon name="box" /></span>
        <strong>{loading || error ? '—' : stats.remainingUnits.toLocaleString('en-IN')} <small>units</small><em>{stats.uniqueSkus} SKUs</em></strong>
        <p>Expected value {money(stats.expectedValue, 0)}</p>
        <div className="grn-meter amber"><i style={{ width: `${stats.remainingUnits ? 70 : 0}%` }} /></div>
      </article>
      <article className="grn-kpi">
        <span>Quality Check Pass <GrnIcon name="gauge" /></span>
        <strong className="grn-good">{loading || error ? '—' : `${stats.passRate.toFixed(1)}%`}</strong>
        <p>{stats.rejected} rejected/damaged units · {stats.inspectedReceipts} receipts inspected</p>
        <div className="grn-meter green"><i style={{ width: `${stats.passRate}%` }} /></div>
      </article>
      <article className="grn-kpi">
        <span>Completed Today <GrnIcon name="clipboard" /></span>
        <strong>{loading || error ? '—' : stats.completedToday} <small>GRNs</small>{stats.deltaVsAvg !== null && <em className={stats.deltaVsAvg >= 0 ? 'up' : 'down'}>{stats.deltaVsAvg >= 0 ? '+' : ''}{stats.deltaVsAvg}% vs avg</em>}</strong>
        <p>{stats.acceptedToday.toLocaleString('en-IN')} units accepted into stock today</p>
        <div className="grn-meter green"><i style={{ width: `${Math.min(100, stats.completedToday * 12)}%` }} /></div>
      </article>
    </div>

    <div className="grn-intake">
      <div className="grn-intake-head">
        <div>
          <span className="grn-intake-dot" />
          <strong>Inward consignment intake &amp; verification</strong>
        </div>
        <span className="grn-shift">Receiver shift: <strong>{account?.name || account?.email || 'Current user'}</strong></span>
      </div>
      <div className="grn-intake-grid">
        <label className="grn-field">
          <span>Purchase order <b>*</b></span>
          <select ref={orderSelectRef} value={selectedOrderId} onChange={(event) => selectOrder(event.target.value)}>
            <option value="">Select an awaiting purchase order…</option>
            {pendingOrders.map((order) => <option key={order.purchaseOrderId} value={order.purchaseOrderId}>{order.orderNumber} — {order.supplierName} ({order.items.length} lines · {money(order.totalAmount, 0)})</option>)}
          </select>
          <small>Only ordered products can be received. Partial receiving is supported.</small>
        </label>
        <label className="grn-field">
          <span>Vendor challan / invoice #</span>
          <div className="grn-verify-field">
            <input value={challan} onChange={(event) => setChallan(event.target.value)} placeholder="e.g. CH-98412" />
            {challan.trim() && <em>✓ Captured</em>}
          </div>
          <small>Recorded on the GRN note for reconciliation.</small>
        </label>
        <label className="grn-field">
          <span>Dock staging bay</span>
          <select value={dockBay} onChange={(event) => setDockBay(event.target.value)}>
            {DOCK_BAYS.map((bay) => <option key={bay} value={bay}>{bay}</option>)}
          </select>
          <small>Assign the inspection lane for this consignment.</small>
        </label>
        <button type="button" className="grn-load" onClick={() => orderSelectRef.current?.focus()} disabled={!!selectedOrder}>
          {selectedOrder ? 'Manifest loaded' : 'Load manifest'}<GrnIcon name="arrow" />
        </button>
      </div>
    </div>

    {selectedOrder && <section className="grn-manifest" aria-label="Consignment SKU manifest">
      <div className="grn-manifest-head">
        <div>
          <p className="grn-manifest-kicker">Consignment SKU manifest · {selectedOrder.orderNumber}</p>
          <h2>{selectedOrder.supplierName}<span>{selectedOrder.status}</span></h2>
        </div>
        <div className="grn-manifest-actions">
          <button type="button"><GrnIcon name="printer" />Bulk print labels</button>
          <button type="button" className="accent" onClick={acceptAllAsOrdered}><GrnIcon name="check" />Accept all as ordered</button>
        </div>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="grn-table-scroll" tabIndex={0} role="region" aria-label="Manifest lines">
          <table className="grn-table">
            <thead><tr>
              <th>Product &amp; SKU</th><th className="num">Ordered</th><th>Received qty</th><th>Accepted / shortage</th>
              <th>Batch &amp; expiry</th><th>Barcode</th><th>Inspection</th>
            </tr></thead>
            <tbody>
              {lines.map((line, index) => {
                const remaining = line.orderedQuantity - line.alreadyReceived
                const received = Number(line.receivedQuantity || 0)
                const accepted = Math.max(0, received - Number(line.damagedQuantity || 0) - Number(line.rejectedQuantity || 0))
                const shortage = Math.max(0, remaining - received)
                const status = lineStatus(line)
                return <tr key={line.productId}>
                  <td>
                    <div className="grn-product">
                      <span className="grn-avatar">{(line.productName || '?').slice(0, 2).toUpperCase()}</span>
                      <div>
                        <strong>{line.productName}</strong>
                        <small>{line.variantSku || 'SKU on file'}{line.alreadyReceived > 0 ? ` · ${line.alreadyReceived} received earlier` : ''}</small>
                      </div>
                    </div>
                  </td>
                  <td className="num"><strong>{line.orderedQuantity}</strong><small>ordered</small></td>
                  <td>
                    <div className="grn-stepper">
                      <button type="button" aria-label="Decrease" onClick={() => stepQty(index, -1)}><GrnIcon name="minus" /></button>
                      <input aria-label={`${line.productName} received quantity`} type="number" min="0" max={remaining} value={line.receivedQuantity} onChange={(event) => updateLine(index, 'receivedQuantity', event.target.value)} />
                      <button type="button" aria-label="Increase" onClick={() => stepQty(index, 1)}><GrnIcon name="plus" /></button>
                    </div>
                    <small>{received === remaining ? 'Exact match' : `of ${remaining} remaining`}</small>
                  </td>
                  <td>
                    <div className="grn-accept">
                      <strong className={shortage > 0 ? 'short' : ''}>{accepted} accepted</strong>
                      <label>Damaged<input type="number" min="0" value={line.damagedQuantity} onChange={(event) => updateLine(index, 'damagedQuantity', event.target.value)} /></label>
                      <label>Rejected<input type="number" min="0" value={line.rejectedQuantity} onChange={(event) => updateLine(index, 'rejectedQuantity', event.target.value)} /></label>
                      <small>{shortage > 0 ? `${shortage} short` : 'No shortage'}</small>
                    </div>
                  </td>
                  <td>
                    <input className="grn-batch" aria-label={`${line.productName} batch number`} value={line.batchNumber} onChange={(event) => updateLine(index, 'batchNumber', event.target.value)} placeholder="Batch / lot #" />
                    <input className="grn-expiry" aria-label={`${line.productName} expiry date`} type="date" value={line.expiryDate} onChange={(event) => updateLine(index, 'expiryDate', event.target.value)} />
                  </td>
                  <td><span className={`grn-barcode ${line.variantSku ? 'ok' : 'none'}`}>{line.variantSku ? 'Scanned' : 'No barcode'}</span></td>
                  <td><span className={`grn-pill ${status.tone}`}><i />{status.label}</span></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
        <label className="grn-notes" htmlFor="receiving-notes">Receiving notes</label>
        <textarea id="receiving-notes" name="notes" placeholder="Dock observations, temperature checks, discrepancies…" />
        <div className="grn-form-actions">
          <button className="grn-cancel" type="button" onClick={() => { setSelectedOrderId(''); setLines([]) }}>Cancel</button>
          <button className="grn-submit" type="submit" disabled={saving}>{saving ? 'Posting GRN…' : 'Post GRN to stock'}<GrnIcon name="arrow" /></button>
        </div>
      </form>
    </section>}

    <section className="grn-history">
      <div className="grn-history-head">
        <div>
          <p className="grn-manifest-kicker">Completed receiving</p>
          <h2>GRN history</h2>
        </div>
        <label className="grn-search">
          <input aria-label="Search receiving history" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search GRN or PO reference" />
        </label>
      </div>
      <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!visibleHistory.length} emptyText={receivings.length ? 'No GRNs match your search.' : 'No goods received notes logged yet.'}>
        <div className="grn-history-list">
          {visibleHistory.map((receiving) => {
            const accepted = receiving.items.reduce((sum, item) => sum + Number(item.acceptedQuantity || 0), 0)
            const flagged = receiving.items.reduce((sum, item) => sum + Number(item.damagedQuantity || 0) + Number(item.rejectedQuantity || 0), 0)
            return <div className="grn-history-row" key={receiving.receivingId}>
              <span className={`grn-pill ${flagged > 0 ? 'amber' : 'green'}`}><i />{flagged > 0 ? 'Posted with flags' : 'Posted clean'}</span>
              <div>
                <strong>{receiving.receivingId}</strong>
                <small>PO {receiving.purchaseOrderId} · {receiving.items.length} lines · {new Date(receiving.receivedAt).toLocaleString('en-GB')} · {receiving.receivedBy || 'Receiver'}</small>
              </div>
              <span className="grn-history-qty">{accepted.toLocaleString('en-IN')} accepted{flagged > 0 ? ` · ${flagged} flagged` : ''}</span>
            </div>
          })}
        </div>
      </AsyncBoundary>
    </section>

    <footer className="grn-statusbar">
      <span><i />Stockroom · Dock &amp; GRN control</span>
      <span>{business.currency === 'INR' ? 'Node ap-south-1 · Mumbai' : 'Workspace region'}</span>
      <span>{DOCK_BAYS.length} dock bays online</span>
      <span className="grn-statusbar-suite">Enterprise Warehousing OS</span>
    </footer>
  </section>
}

export default Receiving
