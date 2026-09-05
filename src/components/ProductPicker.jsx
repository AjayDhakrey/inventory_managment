import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import '../styles/product-picker.css'

export default function ProductPicker({ id, name, products, value, onChange, disabled = false, required = false }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [position, setPosition] = useState(null)
  const inputRef = useRef(null)
  const fieldRef = useRef(null)
  const menuRef = useRef(null)
  const optionRefs = useRef([])
  const selected = products.find((product) => product.productId === value)
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matching = products.filter((product) => {
    const text = [product.name, product.sku, product.barcode, product.size, product.color].filter(Boolean).join(' ').toLowerCase()
    return terms.every((term) => text.includes(term))
  })
  const expanded = open && !disabled
  const listId = `${id}-options`
  const selectedLabel = selected ? `${selected.name} (${selected.sku})` : ''

  useEffect(() => {
    inputRef.current?.setCustomValidity(required && !selected ? 'Choose a product from the list.' : '')
  }, [required, selected])

  useLayoutEffect(() => {
    if (!expanded) return undefined
    const placeMenu = () => {
      const rect = fieldRef.current.getBoundingClientRect()
      const viewport = window.visualViewport
      const viewLeft = viewport?.offsetLeft || 0
      const viewTop = viewport?.offsetTop || 0
      const viewWidth = viewport?.width || document.documentElement.clientWidth
      const viewHeight = viewport?.height || window.innerHeight
      const below = Math.max(0, viewTop + viewHeight - rect.bottom - 14)
      const above = Math.max(0, rect.top - viewTop - 14)
      const upwards = below < 200 && above > below
      const width = Math.min(Math.max(rect.width, 320), viewWidth - 16)
      setPosition({
        width,
        left: Math.max(viewLeft + 8, Math.min(rect.left, viewLeft + viewWidth - width - 8)),
        top: upwards ? rect.top - 6 : rect.bottom + 6,
        maxHeight: Math.min(320, upwards ? above : below),
        transform: upwards ? 'translateY(-100%)' : undefined,
      })
    }
    const onScroll = (event) => {
      if (!menuRef.current?.contains(event.target)) placeMenu()
    }
    const onOutsidePress = (event) => {
      if (!fieldRef.current.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false)
    }
    placeMenu()
    window.addEventListener('resize', placeMenu)
    document.addEventListener('scroll', onScroll, true)
    document.addEventListener('pointerdown', onOutsidePress)
    window.visualViewport?.addEventListener('resize', placeMenu)
    window.visualViewport?.addEventListener('scroll', placeMenu)
    return () => {
      window.removeEventListener('resize', placeMenu)
      document.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('pointerdown', onOutsidePress)
      window.visualViewport?.removeEventListener('resize', placeMenu)
      window.visualViewport?.removeEventListener('scroll', placeMenu)
    }
  }, [expanded])

  useEffect(() => {
    if (expanded) optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, expanded])

  const openMenu = () => {
    if (disabled || expanded) return
    setQuery('')
    setActiveIndex(products.findIndex((product) => product.productId === value))
    setOpen(true)
  }
  const choose = (product) => {
    onChange(product.productId)
    inputRef.current.focus({ preventScroll: true })
    setOpen(false)
    setQuery('')
  }
  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!expanded) {
        openMenu()
        setActiveIndex(event.key === 'ArrowDown' ? 0 : products.length - 1)
      } else {
        const direction = event.key === 'ArrowDown' ? 1 : -1
        setActiveIndex((current) => matching.length ? (current + direction + matching.length) % matching.length : -1)
      }
    } else if (event.key === 'Enter' && expanded) {
      event.preventDefault()
      const product = matching[activeIndex] || matching[0]
      if (product) choose(product)
    } else if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className="product-picker" ref={fieldRef}>
      <input type="hidden" name={name} value={selected?.productId || ''} />
      <input
        ref={inputRef}
        id={id}
        className="product-picker-input"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={expanded && matching[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        required={required}
        disabled={disabled}
        placeholder={disabled ? 'Loading or saving…' : 'Search product or SKU'}
        title={selectedLabel}
        value={expanded ? query : selectedLabel}
        onFocus={openMenu}
        onClick={openMenu}
        onChange={(event) => {
          setQuery(event.target.value)
          onChange('')
          setActiveIndex(0)
          setOpen(true)
          if (menuRef.current) menuRef.current.scrollTop = 0
        }}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          if (!fieldRef.current.contains(event.relatedTarget) && !menuRef.current?.contains(event.relatedTarget)) setOpen(false)
        }}
      />
      <button
        className="product-picker-toggle"
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label={expanded ? 'Close product list' : 'Open product list'}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (expanded) setOpen(false)
          else { inputRef.current.focus(); openMenu() }
        }}
      >
        <span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span>
      </button>
      {expanded && position && createPortal(
        <div
          ref={menuRef}
          className="product-picker-menu"
          style={position}
          id={listId}
          role="listbox"
          aria-label="Products"
        >
          {matching.map((product, index) => (
            <button
              key={product.productId}
              id={`${listId}-${index}`}
              ref={(element) => { optionRefs.current[index] = element }}
              className={`product-picker-option${index === activeIndex ? ' highlighted' : ''}`}
              type="button"
              role="option"
              aria-selected={product.productId === value}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(product)}
            >
              <strong>{product.name}</strong>
              <small>{[product.sku, product.size, product.color].filter(Boolean).join(' · ')}</small>
              <span>{Number(product.currentStock || 0).toLocaleString()} {product.unit || 'units'} in stock</span>
            </button>
          ))}
          {!matching.length && <p className="product-picker-empty" role="status">{products.length ? 'No matching products. Try another name or SKU.' : 'No products available. Add a product first.'}</p>}
        </div>,
        document.body,
      )}
    </div>
  )
}
