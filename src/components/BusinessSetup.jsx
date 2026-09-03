import { useState } from 'react'
import { businessApi } from '../api/businessApi.js'

const industries = ['Grocery', 'Clothing', 'Electronics', 'Hardware', 'Pharmacy', 'Restaurant', 'Automobile', 'Manufacturing', 'Wholesale', 'Retail', 'Other']
const businessTypes = ['Retail', 'Wholesale', 'Manufacturing', 'Service', 'Other']

function BusinessSetup({ onComplete }) {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return
    const data = new FormData(event.currentTarget)
    const business = {
      name: data.get('businessName').trim(),
      industry: data.get('industry'),
      businessType: data.get('businessType'),
      phone: data.get('phone').trim(),
      email: data.get('businessEmail').trim().toLowerCase(),
      address: data.get('address').trim(),
      city: data.get('city').trim(),
      state: data.get('state').trim(),
      country: data.get('country'),
      currency: data.get('currency'),
    }
    if (!business.name || !business.industry || !business.businessType || !business.email || !business.city || !business.country || !business.currency) {
      setError('Please complete all required fields before continuing.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await businessApi.create(business)
      onComplete(result)
    } catch (caught) {
      setError(caught.message || 'We could not create your workspace. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="setup-shell"><header className="setup-header"><div className="brand-mark"><span className="mark-icon" aria-hidden="true"><span /></span><span>stockroom</span></div><span className="setup-step">Step 1 of 1 <span className="setup-status" /></span></header><section className="setup-content"><div className="setup-intro"><p className="eyebrow">Set up your workspace</p><h1>Tell us about<br /><em>your business.</em></h1><p>These details help us tailor Stockroom to the way you work. You can change them anytime in settings.</p></div><form className="setup-form" onSubmit={handleSubmit}><div className="setup-form-heading"><h2>Business details</h2><p>Fields marked with <span>*</span> are required.</p></div><div className="form-grid"><div className="field-wide"><label htmlFor="businessName">Business name *</label><input id="businessName" name="businessName" placeholder="e.g. ABC General Store" required /></div><div><label htmlFor="industry">Industry *</label><select id="industry" name="industry" defaultValue="" required><option value="" disabled>Select industry</option>{industries.map((item) => <option key={item} value={item.toLowerCase()}>{item}</option>)}</select></div><div><label htmlFor="businessType">Business type *</label><select id="businessType" name="businessType" defaultValue="" required><option value="" disabled>Select type</option>{businessTypes.map((item) => <option key={item} value={item.toLowerCase()}>{item}</option>)}</select></div><div><label htmlFor="phone">Phone</label><input id="phone" name="phone" type="tel" placeholder="+91 98765 43210" /></div><div><label htmlFor="businessEmail">Business email *</label><input id="businessEmail" name="businessEmail" type="email" placeholder="hello@yourbusiness.com" required /></div><div className="field-wide"><label htmlFor="address">Address</label><input id="address" name="address" placeholder="Street and building name" /></div><div><label htmlFor="city">City *</label><input id="city" name="city" placeholder="e.g. New Delhi" required /></div><div><label htmlFor="state">State</label><input id="state" name="state" placeholder="e.g. Delhi" /></div><div><label htmlFor="country">Country *</label><select id="country" name="country" defaultValue="India" required><option>India</option><option>United States</option><option>United Kingdom</option><option>Australia</option><option>Other</option></select></div><div><label htmlFor="currency">Currency *</label><select id="currency" name="currency" defaultValue="INR" required><option value="INR">INR - Indian Rupee</option><option value="USD">USD - US Dollar</option><option value="GBP">GBP - Pound Sterling</option><option value="AUD">AUD - Australian Dollar</option></select></div></div>{error && <p className="setup-error" role="alert">{error}</p>}<div className="setup-actions"><p>Your workspace will be created with you as <strong>Admin</strong>.</p><button className="submit-button" type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create business'} <span>→</span></button></div></form></section></main>
}

export default BusinessSetup
