import { test } from 'node:test'
import assert from 'node:assert/strict'
import { manualWhatsappCode } from '../../lib/auth/manual-whatsapp-code.ts'
test('manual code adds and keeps the last six digits with leading zeros for local and international phone formats', () => {
  assert.equal(manualWhatsappCode('01092912431'), '035887')
  assert.equal(manualWhatsappCode('+20 109 291 2431'), '035887')
  assert.equal(manualWhatsappCode('٠١٠٩٢٩١٢٤٣١'), '035887')
  assert.equal(manualWhatsappCode('01000000000'), '123456')
  assert.equal(manualWhatsappCode('01000999999'), '123455')
  assert.equal(manualWhatsappCode('123'), null)
  assert.equal(manualWhatsappCode(''), null)
})
