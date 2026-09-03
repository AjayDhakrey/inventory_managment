import { useCallback, useState } from 'react'
import { receivingApi } from '../api/receivingApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'

function Receiving({ business }) {
  const load = useCallback(() => Promise.all([receivingApi.pendingOrders(), receivingApi.list()]), [])
  const { data, loading, error, refetch, setData } = useResource(load, [], [[], []])
  const [pendingOrders, receivings] = data

  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [lines, setLines] = useState([])
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)

  const selectedOrder = pendingOrders.find((order) => order.purchaseOrderId === selectedOrderId)

  const selectOrder = (orderId) => {
    const order = pendingOrders.find((item) => item.purchaseOrderId === orderId)
    setSelectedOrderId(orderId)
    setMessage(null)
    setLines(
      order
        ? order.lines.map((line) => ({
            productId: line.productId,
            productName: line.productName,
            orderedQuantity: line.orderedQuantity,
            alreadyReceived: line.alreadyReceived,
            receivedQuantity: Math.max(0, line.orderedQuantity - line.alreadyReceived),
            damagedQuantity: 0,
            rejectedQuantity: 0,
            batchNumber: '',
            expiryDate: '',
          }))
        : [],
    )
  }
  const updateLine = (index, field, value) => setLines(lines.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line))

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
      const payload = {
        purchaseOrderId: selectedOrder.purchaseOrderId,
        notes: new FormData(event.currentTarget).get('notes').trim(),
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
      setMessage({ type: 'success', text: `${receiving.receivingId} recorded. Accepted stock was added to inventory.` })
      event.currentTarget.reset()
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not record the receiving.' })
    } finally {
      setSaving(false)
    }
  }
  const visibleHistory = receivings.filter((receiving) => `${receiving.receivingId} ${receiving.purchaseOrderId} ${receiving.supplierId}`.toLowerCase().includes(search.toLowerCase()))

  return <section className="receiving-page"><div className="products-toolbar"><div><p className="dashboard-kicker">Purchases / Receiving</p><h2>Receiving</h2><p className="products-count">Receive products into {business.name}</p></div><span className="business-filter">{pendingOrders.length} awaiting</span></div>{message && <p className={`form-status ${message.type}`}>{message.text}</p>}<div className="receiving-selector"><div><label htmlFor="receiving-order">Purchase order *</label><select id="receiving-order" value={selectedOrderId} onChange={(event) => selectOrder(event.target.value)}><option value="">Select pending purchase order</option>{pendingOrders.map((order) => <option key={order.purchaseOrderId} value={order.purchaseOrderId}>{order.orderNumber} · {order.supplierName}</option>)}</select></div><p>Only ordered products can be received. Partial receiving is supported.</p></div>{selectedOrder && <form className="receiving-form" onSubmit={handleSubmit}><div className="receiving-order-heading"><div><p className="dashboard-kicker">{selectedOrder.orderNumber} · {selectedOrder.supplierName}</p><h3>Confirm received quantities</h3></div><span className="po-status">{selectedOrder.status}</span></div><div className="receiving-lines"><div className="receiving-line receiving-line-head"><span>Product</span><span>Ordered</span><span>Received</span><span>Damaged</span><span>Rejected</span><span>Batch</span><span>Expiry</span></div>{lines.map((line, index) => <div className="receiving-line" key={line.productId}><span><strong>{line.productName}</strong><small>{line.alreadyReceived} received previously</small></span><span>{line.orderedQuantity}</span><input aria-label={`${line.productName} received quantity`} type="number" min="0" max={line.orderedQuantity - line.alreadyReceived} value={line.receivedQuantity} onChange={(event) => updateLine(index, 'receivedQuantity', event.target.value)} /><input aria-label={`${line.productName} damaged quantity`} type="number" min="0" value={line.damagedQuantity} onChange={(event) => updateLine(index, 'damagedQuantity', event.target.value)} /><input aria-label={`${line.productName} rejected quantity`} type="number" min="0" value={line.rejectedQuantity} onChange={(event) => updateLine(index, 'rejectedQuantity', event.target.value)} /><input aria-label={`${line.productName} batch number`} value={line.batchNumber} onChange={(event) => updateLine(index, 'batchNumber', event.target.value)} placeholder="Optional" /><input aria-label={`${line.productName} expiry date`} type="date" value={line.expiryDate} onChange={(event) => updateLine(index, 'expiryDate', event.target.value)} /></div>)}</div><label htmlFor="receiving-notes">Notes</label><textarea id="receiving-notes" name="notes" placeholder="Add receiving notes" /><div className="product-form-actions"><button className="outline-button" type="button" onClick={() => { setSelectedOrderId(''); setLines([]) }}>Cancel</button><button className="submit-button" type="submit" disabled={saving}>{saving ? 'Receiving…' : 'Receive products'} <span>→</span></button></div></form>}<div className="section-heading receiving-history-heading"><div><p className="dashboard-kicker">Completed receiving</p><h2>Receiving history</h2></div><div className="search-box receiving-search"><span>⌕</span><input aria-label="Search receiving history" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search receiving" /></div></div><AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!visibleHistory.length} emptyText="No receiving records for this business yet."><div className="history-list">{visibleHistory.map((receiving) => <div className="history-row" key={receiving.receivingId}><span className="history-type stock_in">received</span><span><strong>{receiving.receivingId} · {receiving.purchaseOrderId}</strong><small>{receiving.items.length} products · {new Date(receiving.receivedAt).toLocaleString()} · by {receiving.receivedBy}</small></span><span className="history-quantity">{receiving.items.reduce((sum, item) => sum + item.acceptedQuantity, 0)} accepted</span></div>)}</div></AsyncBoundary></section>
}

export default Receiving
