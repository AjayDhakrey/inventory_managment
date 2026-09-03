import { ApiError } from '../utils/ApiError.js'
import { toObjectId } from '../validators/assert.js'

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Business-scoped CRUD for simple resources. Every query is filtered by the
 * authenticated business id - the caller never passes it in the body.
 */
export function createCrudService(Model, { searchFields = [], defaultSort = '-createdAt', label = 'Record' } = {}) {
  const scoped = (businessId, extra = {}) => ({ business: toObjectId(businessId, 'business'), ...extra })

  async function list(businessId, query = {}) {
    const filter = scoped(businessId)
    if (query.status && query.status !== 'all') filter.status = query.status
    if (query.search && searchFields.length) {
      const rx = new RegExp(escapeRegExp(String(query.search).trim()), 'i')
      filter.$or = searchFields.map((field) => ({ [field]: rx }))
    }

    const hasPaging = query.page !== undefined || query.limit !== undefined
    const page = Math.max(1, Number(query.page) || 1)
    const limit = hasPaging ? Math.min(100, Math.max(1, Number(query.limit) || 20)) : 0

    const cursor = Model.find(filter).sort(defaultSort)
    if (limit) cursor.skip((page - 1) * limit).limit(limit)

    const docs = await cursor
    const items = docs.map((doc) => doc.toJSON())
    if (!hasPaging) return items

    const total = await Model.countDocuments(filter)
    return { items, meta: { page, limit, total, pages: Math.ceil(total / limit) } }
  }

  async function get(businessId, id) {
    const doc = await Model.findOne(scoped(businessId, { _id: toObjectId(id, `${label} id`) }))
    if (!doc) throw ApiError.notFound(`${label} not found.`)
    return doc.toJSON()
  }

  async function create(businessId, payload) {
    const doc = await Model.create({ ...payload, business: toObjectId(businessId, 'business') })
    return doc.toJSON()
  }

  async function update(businessId, id, payload) {
    const doc = await Model.findOne(scoped(businessId, { _id: toObjectId(id, `${label} id`) }))
    if (!doc) throw ApiError.notFound(`${label} not found.`)
    delete payload.business
    delete payload._id
    Object.assign(doc, payload)
    await doc.save()
    return doc.toJSON()
  }

  async function remove(businessId, id) {
    const doc = await Model.findOneAndDelete(scoped(businessId, { _id: toObjectId(id, `${label} id`) }))
    if (!doc) throw ApiError.notFound(`${label} not found.`)
    return { deleted: true }
  }

  return { list, get, create, update, remove, scoped }
}
