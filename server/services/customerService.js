import { Customer } from '../models/Customer.js'
import { createCrudService } from './crudService.js'
import { requireFields, assert, isEmail } from '../validators/assert.js'

const base = createCrudService(Customer, {
  searchFields: ['name', 'email', 'phone', 'city'],
  label: 'Customer',
})

const PHONE = /^[+\d][\d\s()-]{6,}$/

function validate(payload, { partial } = {}) {
  if (!partial) requireFields(payload, ['name'])
  if (payload.email) assert(isEmail(payload.email), 'Enter a valid customer email.')
  if (payload.phone) assert(PHONE.test(payload.phone), 'Enter a valid customer phone number.')
}

async function create(businessId, payload) {
  validate(payload)
  return base.create(businessId, payload)
}

async function update(businessId, id, payload) {
  validate(payload, { partial: true })
  return base.update(businessId, id, payload)
}

async function archive(businessId, id) {
  return base.update(businessId, id, { status: 'archived' })
}

export const customerService = { ...base, create, update, archive }
