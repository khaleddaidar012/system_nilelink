import test from 'node:test'
import assert from 'node:assert/strict'
import { visibleRequestServices } from '../../lib/requests/visible-services.ts'

test('customer request hides cancelled and quote-declined services while retaining completed accepted services', () => {
  const services = [{_id:'sea',status:'cancelled'},{_id:'air',status:'active'},{_id:'road',status:'completed'},{_id:'other',status:'pending'}]
  assert.deepEqual(visibleRequestServices(services,['air','road']).map(s=>s._id), ['air','road'])
  assert.deepEqual(visibleRequestServices(services).map(s=>s._id), ['air','road','other'])
  assert.deepEqual(visibleRequestServices(services,[]), [])
})
