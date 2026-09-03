import { useCallback, useEffect, useRef, useState } from 'react'
import { notificationApi } from '../api/notificationApi.js'

const ICONS = { inventory: '▣', purchases: '↗', sales: '◒', payments: '$', suppliers: '♧', returns: '↩', users: '♙', system: '!' }

function relativeTime(value) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 45) return 'just now'
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`
  return new Date(value).toLocaleDateString()
}

export default function NotificationCenter({ onNavigate, onOpen, onChange }) {
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  const [data, setData] = useState({ items: [], unreadCount: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const previousUnread = useRef(0)
  const [pulse, setPulse] = useState(false)

  const load = useCallback(async () => {
    try {
      const result = await notificationApi.list({ limit: all ? 100 : 30 })
      setData(result)
      onChange?.(result)
      setError('')
      if (result.unreadCount > previousUnread.current) {
        setPulse(true)
        setTimeout(() => setPulse(false), 700)
      }
      previousUnread.current = result.unreadCount
    } catch (caught) {
      setError(caught.message || 'Could not load notifications.')
    } finally {
      setLoading(false)
    }
  }, [all, onChange])

  useEffect(() => {
    // The effect deliberately performs the initial synchronization fetch.
    // eslint-disable-next-line react/set-state-in-effect
    load()
    const changed = () => setTimeout(load, 300)
    const visible = () => document.visibilityState === 'visible' && load()
    window.addEventListener('stockroom:data-changed', changed)
    document.addEventListener('visibilitychange', visible)
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), 30000)
    return () => { clearInterval(timer); window.removeEventListener('stockroom:data-changed', changed); document.removeEventListener('visibilitychange', visible) }
  }, [load])

  const view = async (item) => {
    if (!item.readAt) await notificationApi.markRead(item.notificationId)
    setData((current) => ({ ...current, unreadCount: Math.max(0, current.unreadCount - (item.readAt ? 0 : 1)), items: current.items.map((row) => row.notificationId === item.notificationId ? { ...row, readAt: new Date().toISOString() } : row) }))
    setOpen(false)
    onNavigate(item.navigationTarget, item.relatedEntityId)
  }
  const readAll = async () => { await notificationApi.markAllRead(); await load() }
  const dismiss = async (event, item) => { event.stopPropagation(); await notificationApi.dismiss(item.notificationId); await load() }

  return <div className="header-popover-wrap">
    <button className={`icon-button${pulse ? ' notif-pulse' : ''}`} type="button" aria-label={`Notifications${data.unreadCount ? `, ${data.unreadCount} unread` : ''}`} aria-expanded={open} onClick={() => { setOpen(!open); onOpen?.(); if (!open) load() }}>♢{data.unreadCount > 0 && <span className="notification-badge">{data.unreadCount > 99 ? '99+' : data.unreadCount}</span>}</button>
    {open && <div className="header-popover notification-popover">
      <div className="notif-head"><span><strong>Notifications</strong><small>{data.unreadCount} unread</small></span>{data.unreadCount > 0 && <button type="button" onClick={readAll}>Mark all read</button>}</div>
      {loading && !data.items.length ? <p className="notif-status">Loading…</p> : error ? <div className="notif-status notif-status-error"><p>{error}</p><button type="button" onClick={load}>Retry</button></div> : !data.items.length ? <div className="notif-empty"><span aria-hidden="true">✓</span><strong>You're all caught up</strong><p>No important updates right now.</p></div> : <div className="notif-list">{data.items.map((item) => <div className={`notif-row ${item.severity} ${item.readAt ? 'read' : 'unread'}`} key={item.notificationId} role="button" tabIndex="0" onClick={() => view(item)} onKeyDown={(event) => event.key === 'Enter' && view(item)}><span className="notif-glyph" aria-hidden="true">{ICONS[item.category] || 'i'}</span><span className="notif-text"><strong>{item.title}</strong><small>{item.message}</small><em>{item.category} · {relativeTime(item.createdAt)}</em></span><button className="notif-dismiss" type="button" aria-label="Dismiss notification" onClick={(event) => dismiss(event, item)}>×</button></div>)}</div>}
      <button type="button" className="notif-footer" onClick={() => setAll(!all)}>{all ? 'Show recent notifications' : 'View all notifications'} <span>→</span></button>
    </div>}
  </div>
}
