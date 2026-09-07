import { useCallback } from 'react'
import { reportApi } from '../api/reportApi.js'
import { useResource } from '../hooks/useResource.js'

export default function PosDashboardStats({ business, onOpen }) {
  const load = useCallback(() => reportApi.summary(), [])
  const { data } = useResource(load, [], null)
  return <button className="pos-dashboard-strip" type="button" onClick={onOpen}><span><small>POS Today / History</small><strong>{data?.posInvoices || 0} bills</strong></span><span><small>POS Sales</small><strong>{business.currency} {Number(data?.posSalesTotal || 0).toFixed(2)}</strong></span><span><small>Collected Cash / UPI</small><strong>{business.currency} {Number(data?.posPaymentsReceived || 0).toFixed(2)}</strong></span><span className={data?.posOutstanding > 0 ? 'due' : ''}><small>Outstanding Credit</small><strong>{business.currency} {Number(data?.posOutstanding || 0).toFixed(2)}</strong></span><b>Open POS Terminal →</b></button>
}
