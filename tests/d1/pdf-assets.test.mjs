import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadPdfAssetsFromBinding, getPdfAssets } from '../../lib/services/pdf-assets.ts'

const files = new Map(await Promise.all(['fonts/Amiri-Regular.ttf', 'fonts/Amiri-Bold.ttf', 'images/logo.png'].map(async name => [name, await readFile('public/' + name)])))
const binding = { async fetch(input) { const url = new URL(input); assert.equal(url.origin, 'https://assets.local'); const bytes = files.get(url.pathname.slice(1)); return new Response(bytes, { status: bytes ? 200 : 404 }) } }

test('PDF assets load exact Arabic font and logo bytes through fixed binding paths', async () => {
  const result = await loadPdfAssetsFromBinding(binding)
  assert.deepEqual(result.regular, files.get('fonts/Amiri-Regular.ttf'))
  assert.deepEqual(result.bold, files.get('fonts/Amiri-Bold.ttf'))
  assert.deepEqual(result.logo, files.get('images/logo.png'))
})

test('missing assets, HTML fallbacks and oversized files reject instead of producing a broken Arabic PDF', async () => {
  for (const response of [() => new Response('missing', { status: 404 }), () => new Response('<html>fallback</html>'), () => new Response(new Uint8Array(5 * 1024 * 1024 + 1))]) {
    await assert.rejects(loadPdfAssetsFromBinding({ async fetch() { return response() } }), /unavailable|Invalid/)
  }
})

test('PDF asset gateway uses current ASSETS binding and fails closed without it', async () => {
  const key = Symbol.for('__cloudflare-context__'), previousContext = globalThis[key], previousMode = process.env.PDF_ASSET_MODE
  try {
    process.env.PDF_ASSET_MODE = 'binding'; globalThis[key] = { env: { ASSETS: binding }, cf: {}, ctx: {} }
    assert.deepEqual((await getPdfAssets()).regular, files.get('fonts/Amiri-Regular.ttf'))
    globalThis[key] = { env: {}, cf: {}, ctx: {} }
    await assert.rejects(getPdfAssets(), /ASSETS binding is required/)
    process.env.PDF_ASSET_MODE = 'typo'
    await assert.rejects(getPdfAssets(), /Invalid PDF_ASSET_MODE/)
  } finally {
    if (previousContext === undefined) delete globalThis[key]; else globalThis[key] = previousContext
    if (previousMode === undefined) delete process.env.PDF_ASSET_MODE; else process.env.PDF_ASSET_MODE = previousMode
  }
})
