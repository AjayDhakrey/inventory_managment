import { useEffect, useMemo, useRef, useState } from 'react'
import { authApi } from '../api/authApi.js'
import { businessApi } from '../api/businessApi.js'
import { productApi } from '../api/productApi.js'
import { supplierApi } from '../api/supplierApi.js'
import { userApi } from '../api/userApi.js'
import { resolveBusinessCapabilities } from '../../shared/industryConfig.js'
import '../styles/onboarding.css'

const industries = ['Clothing', 'Grocery', 'Pharmacy', 'Electronics', 'Hardware', 'Restaurant', 'Automobile', 'Manufacturing', 'Wholesale', 'Retail', 'Other']
const businessTypes = ['Retail', 'Wholesale', 'Retail + Wholesale']
const steps = ['Welcome', 'Business details', 'Industry', 'Industry setup', 'Initial inventory', 'Optional setup', 'Complete']
const defaults = { businessName: '', ownerName: '', phone: '', email: '', gstin: '', address: '', city: '', state: '', country: 'India', currency: 'INR', industry: '', businessType: '', lowStockLimit: 10, defaultGstRate: 5, taxEnabled: true, inventoryChoice: 'Overview', optionalDestination: 'Overview' }
const normalizedChoice = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')

const industryFeatureHighlights = {
  hardware: ['POS & Fast Billing', 'Category Organization', 'Low-Stock Alerts', 'Stock In & Out Tracking', 'Supplier Management', 'Sales & Returns'],
  clothing: ['Size Management', 'Color Management', 'Size × Color Variant Grid', 'Variant Barcodes', 'Replenishment', 'Clothing Reports', 'Loyalty & Gift Cards', 'Cashier Shifts'],
  pharmacy: ['Batch Management', 'Expiry Tracking', 'Prescription Management', 'Low-Stock Alerts', 'POS & MRP Billing', 'Batch Alerts'],
  electronics: ['Serial Number Tracking', 'IMEI Tracking', 'Warranty Tracking', 'Brand & Model Catalog', 'Low-Stock Alerts', 'POS & Billing'],
  grocery: ['Expiry Date Tracking', 'Fast POS Billing', 'Promotions & Offers', 'Weighted Product Units', 'Low-Stock Alerts', 'Category Organization'],
  automobile: ['Serial & VIN Tracking', 'Warranty Tracking', 'Brand & Model Catalog', 'Low-Stock Alerts', 'POS & Billing', 'Parts Categories'],
  wholesale: ['Bulk Orders Management', 'Tiered Bulk Pricing', 'Credit Sales Tracking', 'Payment Processing', 'Low-Stock Alerts', 'Supplier Accounts'],
  manufacturing: ['Raw Materials Management', 'Bill of Materials (BOM)', 'Production Stage Tracking', 'Finished Goods Inventory', 'Low-Stock Alerts'],
  restaurant: ['Fast POS & Order Entry', 'Expiry Tracking', 'Low-Stock Alerts', 'Menu & Categories', 'Daily Sales Reports'],
  retail: ['Point of Sale (POS)', 'Category Management', 'Barcode Scanning', 'Real-Time Stock Alerts', 'Customer Accounts'],
  other: ['Central Inventory Tracking', 'Purchase Orders & Suppliers', 'Sales & Invoicing', 'Low-Stock Alerts', 'Reports & Analytics'],
}

const moduleDisplayNames = {
  dashboard: 'Dashboard',
  products: 'Products',
  inventory: 'Inventory',
  purchases: 'Purchases',
  suppliers: 'Suppliers',
  sales: 'Sales & Orders',
  pos: 'Point of Sale (POS)',
  customers: 'Customers',
  payments: 'Payments',
  reports: 'Reports',
  team: 'Team & Roles',
  settings: 'Settings',
  categories: 'Categories',
  batches: 'Batch Tracking',
  expiry: 'Expiry Tracking',
  prescriptions: 'Prescriptions',
  sizes: 'Size Management',
  colors: 'Color Management',
  variants: 'Product Variants',
  variantGrid: 'Variant Grid',
  replenishment: 'Replenishment',
  promotions: 'Promotions',
  loyalty: 'Loyalty Program',
  coupons: 'Coupons',
  giftCards: 'Gift Cards',
  cashierShifts: 'Cashier Shifts',
  clothingReports: 'Clothing Reports',
  serialNumbers: 'Serial Numbers',
  warranties: 'Warranty Tracking',
  offers: 'Offers & Discounts',
  bulkOrders: 'Bulk Orders',
  bulkPricing: 'Bulk Pricing',
  creditSales: 'Credit Sales',
  rawMaterials: 'Raw Materials',
  billOfMaterials: 'Bill of Materials',
  production: 'Production',
  finishedGoods: 'Finished Goods',
  productionTracking: 'Production Tracking',
}

export default function BusinessSetup({ account, business: initialBusiness, onSession, onComplete, theme, onToggleTheme }) {
  const saved = account.onboarding?.draft || {}
  const [step, setStep] = useState(Math.min(7, Math.max(1, account.onboarding?.currentStep || 1)))
  const [form, setForm] = useState({ ...defaults, email: account.email, ownerName: account.name, ...saved, ...(initialBusiness ? { businessName: initialBusiness.name, phone: initialBusiness.phone, email: initialBusiness.email || account.email, gstin: initialBusiness.gstin, address: initialBusiness.address, city: initialBusiness.city, state: initialBusiness.state, country: initialBusiness.country, currency: initialBusiness.currency, industry: initialBusiness.industry, businessType: initialBusiness.businessType } : {}) })
  const [business, setBusiness] = useState(initialBusiness), [error, setError] = useState(''), [working, setWorking] = useState(false), [counts, setCounts] = useState({ products: 0, suppliers: 0, team: 1 })
  const rootRef = useRef(null)
  const capabilities = useMemo(() => business ? business.capabilities || resolveBusinessCapabilities(business) : form.industry && form.businessType ? resolveBusinessCapabilities({ industry: form.industry, businessType: form.businessType }) : null, [business, form.industry, form.businessType])
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  useEffect(() => { rootRef.current?.querySelector('[data-autofocus]')?.focus() }, [step])
  useEffect(() => { if (step === 7 && business) Promise.all([productApi.list(), supplierApi.list({ status: 'all' }), userApi.listMembers()]).then(([products, suppliers, members]) => setCounts({ products: products.length, suppliers: suppliers.length, team: members.length })).catch(() => {}) }, [step, business])
  const invalid = () => step === 2 ? [['businessName', form.businessName], ['ownerName', form.ownerName], ['email', form.email], ['city', form.city], ['country', form.country], ['currency', form.currency]].find(([, value]) => !String(value || '').trim())?.[0] : step === 3 ? [['industry', form.industry], ['businessType', form.businessType]].find(([, value]) => !value)?.[0] : null
  const persist = async (nextStep) => { const result = await authApi.saveOnboarding({ currentStep: nextStep, draft: form, ownerName: form.ownerName }); onSession(result); return result }
  const next = async () => {
    if (working) return
    const missing = invalid()
    if (missing) { setError('Complete the required fields before continuing.'); requestAnimationFrame(() => rootRef.current?.querySelector(`[name="${missing}"]`)?.focus()); return }
    setWorking(true); setError('')
    try {
      let nextBusiness = business
      if (step === 3 && !business) { const result = await businessApi.create({ name: form.businessName, industry: form.industry, businessType: form.businessType, phone: form.phone, email: form.email, gstin: form.gstin, address: form.address, city: form.city, state: form.state, country: form.country, currency: form.currency }); nextBusiness = result.business; setBusiness(nextBusiness); onSession(result) }
      else if (step === 3 && business) { nextBusiness = await businessApi.update({ name: form.businessName, industry: form.industry, businessType: form.businessType, phone: form.phone, email: form.email, gstin: form.gstin, address: form.address, city: form.city, state: form.state, country: form.country, currency: form.currency }); setBusiness(nextBusiness) }
      if (step === 4 && nextBusiness) { nextBusiness = await businessApi.update({ settings: { lowStockLimit: Number(form.lowStockLimit), defaultGstRate: Number(form.defaultGstRate), taxEnabled: form.taxEnabled } }); setBusiness(nextBusiness) }
      const nextStep = Math.min(7, step + 1); await persist(nextStep); setStep(nextStep)
    } catch (caught) { setError(caught.message || 'Could not save onboarding progress.') } finally { setWorking(false) }
  }
  const back = () => { const previous = Math.max(1, step - 1); setStep(previous); persist(previous).catch(() => {}) }
  const finish = async () => { setWorking(true); try { const result = await authApi.saveOnboarding({ currentStep: 7, complete: true, draft: form }); onComplete({ ...result, initialNav: form.optionalDestination !== 'Overview' ? form.optionalDestination : form.inventoryChoice }) } catch (caught) { setError(caught.message) } finally { setWorking(false) } }
  const enterNext = (event) => { if (event.key !== 'Enter' || ['radio', 'checkbox'].includes(event.target.type)) return; event.preventDefault(); const controls = [...rootRef.current.querySelectorAll('[data-enter-nav]')]; const index = controls.indexOf(event.target); if (index < controls.length - 1) controls[index + 1].focus(); else next() }
  const input = (label, name, attributes = {}) => <label>{label}<input name={name} value={form[name]} onChange={(event) => update(name, event.target.type === 'number' ? Number(event.target.value) : event.target.value)} onKeyDown={enterNext} data-enter-nav {...attributes} /></label>
  const select = (label, name, options) => <label>{label}<select name={name} value={form[name]} onChange={(event) => update(name, event.target.value)} onKeyDown={enterNext} data-enter-nav>{options.map(([value, labelText]) => <option key={value} value={value}>{labelText}</option>)}</select></label>
  const cards = (name, values, selected) => <fieldset className="onboarding-choice-grid"><legend>{name === 'industry' ? 'Industry *' : 'Business type *'}</legend>{values.map((value, index) => <label key={value}><input data-autofocus={index === 0 || undefined} type="radio" name={name} checked={normalizedChoice(selected) === normalizedChoice(value)} onChange={() => update(name, value)} /><span>{value}</span></label>)}</fieldset>

  return <main className="onboarding-shell" ref={rootRef}><header className="onboarding-topbar"><div className="brand-mark"><span className="mark-icon" aria-hidden="true"><span /></span><span>stockroom</span></div><button className="outline-button" type="button" onClick={onToggleTheme}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button></header><div className="onboarding-progress"><span>Step {step} of 7 · {steps[step - 1]}</span><div><i style={{ width: `${step / 7 * 100}%` }} /></div></div><section className="onboarding-card">
    {step === 1 && <div className="onboarding-welcome"><p className="eyebrow">Welcome to Stockroom</p><h1>Let’s set up your business.</h1><p>Your products, navigation and workflows will be configured around your industry.</p><button data-autofocus className="submit-button" type="button" onClick={next}>Start Setup <span>→</span></button></div>}
    {step === 2 && <><header className="onboarding-heading"><p className="eyebrow">Your workspace</p><h1>Business details</h1><p>Your account details are prefilled where available.</p></header><div className="onboarding-fields">{input('Business name *', 'businessName', { required: true, 'data-autofocus': true })}{input('Owner name *', 'ownerName', { required: true })}{input('Phone', 'phone', { type: 'tel' })}{input('Email *', 'email', { type: 'email', required: true })}{input('GST / Tax number', 'gstin')}{input('Address', 'address')}{input('City *', 'city', { required: true })}{input('State', 'state')}{select('Country *', 'country', [['India', 'India'], ['United States', 'United States'], ['United Kingdom', 'United Kingdom'], ['Australia', 'Australia'], ['Other', 'Other']])}{select('Currency *', 'currency', [['INR', 'INR — Indian Rupee'], ['USD', 'USD — US Dollar'], ['GBP', 'GBP — Pound Sterling'], ['AUD', 'AUD — Australian Dollar']])}</div></>}
    {step === 3 && <><header className="onboarding-heading"><p className="eyebrow">Configure your workspace</p><h1>Industry and business type</h1><p>The central industry configuration determines enabled modules and permissions.</p></header>{cards('industry', industries, form.industry)}{cards('businessType', businessTypes, form.businessType)}</>}
    {step === 4 && <><header className="onboarding-heading"><p className="eyebrow">{form.industry || 'Industry'} setup</p><h1>Useful starting defaults</h1><p>Only settings supported by the application are configured here.</p></header><div className="onboarding-fields">{input('Low-stock default', 'lowStockLimit', { type: 'number', min: 0, 'data-autofocus': true })}{input('Default GST rate %', 'defaultGstRate', { type: 'number', min: 0, max: 100 })}<label className="onboarding-toggle"><input type="checkbox" checked={form.taxEnabled} onChange={(event) => update('taxEnabled', event.target.checked)} /><span><strong>Enable tax calculations</strong><small>Automatically compute and apply GST/tax rates on sales and billing</small></span></label></div><div className="onboarding-feature-summary"><strong>{form.industry ? `${form.industry} tools enabled` : 'Industry features enabled'}</strong>{(industryFeatureHighlights[normalizedChoice(form.industry)] || industryFeatureHighlights.other).map((item) => <span key={item}>✓ {item}</span>)}</div>{capabilities?.modules?.length > 0 && <details className="onboarding-modules-details"><summary><span>Enabled modules ({capabilities.modules.length})</span></summary><div className="onboarding-modules-list">{capabilities.modules.map((mod) => <span key={mod} className="onboarding-module-pill">✓ {moduleDisplayNames[mod] || mod}</span>)}</div></details>}</>}
    {step === 5 && <><header className="onboarding-heading"><p className="eyebrow">Inventory</p><h1>How would you like to start?</h1><p>Your selection opens an existing inventory workflow after setup.</p></header><fieldset className="onboarding-option-list">{[['Products', 'Add my first product manually', 'Open the existing product form.'], ['Bulk Import', 'Bulk Import products', 'Use the existing PDF, CSV and Excel importer.'], ['Overview', 'Start with empty inventory', 'Go directly to Dashboard.']].map(([value, title, text], index) => <label key={value}><input data-autofocus={index === 0 || undefined} type="radio" name="inventoryChoice" checked={form.inventoryChoice === value} onChange={() => update('inventoryChoice', value)} /><span><strong>{title}</strong><small>{text}</small></span></label>)}</fieldset></>}
    {step === 6 && <><header className="onboarding-heading"><p className="eyebrow">Optional setup</p><h1>Choose your next task</h1><p>You can skip this and configure everything later.</p></header><fieldset className="onboarding-option-list">{[['Suppliers', 'Add first supplier'], ['Customers', 'Add first customer'], ['Users', 'Invite a team member'], ['Overview', 'Do this later']].map(([value, title], index) => <label key={value}><input data-autofocus={index === 0 || undefined} type="radio" name="optionalDestination" checked={form.optionalDestination === value} onChange={() => update('optionalDestination', value)} /><span><strong>{title}</strong></span></label>)}</fieldset></>}
    {step === 7 && <div className="onboarding-complete"><span className="onboarding-success">✓</span><p className="eyebrow">Setup complete</p><h1>Your business is ready.</h1><div className="onboarding-summary">{[['Business', business?.name], ['Industry', business?.industry], ['Type', business?.businessType], ['Currency', business?.currency], ['Products', counts.products], ['Suppliers', counts.suppliers], ['Team members', counts.team]].map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div><button data-autofocus className="submit-button" type="button" disabled={working} onClick={finish}>{working ? 'Finishing…' : 'Go to Dashboard'} <span>→</span></button></div>}
    {error && <p className="setup-error" role="alert">{error}</p>}{step > 1 && step < 7 && <footer className="onboarding-actions"><button className="outline-button" type="button" onClick={back}>Back</button><button className="submit-button" type="button" disabled={working} onClick={next}>{working ? 'Saving…' : step === 6 ? 'Review setup' : 'Continue'} <span>→</span></button></footer>}
  </section></main>
}
