import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { verifyBuildTraceIsolation } from '../../scripts/d1/build-traces.mjs'

test('build traces must contain evidence and all paths must stay inside the sanitized app', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nilelink-traces-'))
  try {
    await mkdir(path.join(directory, '.next'))
    await mkdir(path.join(directory, 'node_modules'))
    await writeFile(path.join(directory, 'node_modules/dependency.js'), 'fixture')
    const filename = path.join(directory, '.next/server.js.nft.json')
    await writeFile(filename, JSON.stringify({ files: ['../node_modules/dependency.js'] }))
    assert.equal((await verifyBuildTraceIsolation(directory)).isolated, true)
    await writeFile(filename, JSON.stringify({ files: ['../../outside.js'] }))
    await assert.rejects(verifyBuildTraceIsolation(directory), /escapes/)
    await writeFile(filename, JSON.stringify({ files: [] }))
    await assert.rejects(verifyBuildTraceIsolation(directory), /evidence/)
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
    assert.ok(path.basename(directory).startsWith('nilelink-traces-'))
    await rm(directory, { recursive: true, force: true })
  }
})
