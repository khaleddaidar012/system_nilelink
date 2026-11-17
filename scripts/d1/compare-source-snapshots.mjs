import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { validateSnapshot } from './snapshot.mjs'

// Compare raw BSON collection digests, not just counts or mapped JSON. This
// detects source drift; two matching exports do not prove writers were frozen.
export async function compareSourceSnapshots(beforeDirectory, afterDirectory) {
  const before = await validateSnapshot(beforeDirectory)
  const after = await validateSnapshot(afterDirectory)
  if (typeof before.manifest.database !== 'string' || !before.manifest.database || before.manifest.database !== after.manifest.database) throw new Error('Snapshots must identify the same source database')
  const first = new Map(before.manifest.collections.map(entry => [entry.name, entry]))
  const second = new Map(after.manifest.collections.map(entry => [entry.name, entry]))
  const collections = [...new Set([...first.keys(), ...second.keys()])].sort().map(name => {
    const left = first.get(name), right = second.get(name)
    return { name, beforeRecords: left?.count ?? null, afterRecords: right?.count ?? null,
      status: !left ? 'added-collection' : !right ? 'removed-collection' : left.sha256 !== right.sha256 ? 'changed' : 'identical' }
  })
  return { scope: 'read-only-source-drift-comparison', checkedAt: new Date().toISOString(),
    status: collections.every(entry => entry.status === 'identical') ? 'identical-exports' : 'source-drift-detected',
    sourceModified: false, productionCertified: false, writeFreezeProven: false,
    limitation: 'Matching exports do not establish a shared point-in-time snapshot or prove that every writer is stopped.',
    collections }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw new Error('Use compare-source-snapshots.mjs <before-snapshot> <after-snapshot>')
  // validateSnapshot verifies all record bytes before any result is emitted.
  const result = await compareSourceSnapshots(process.argv[2], process.argv[3])
  console.log(JSON.stringify(result))
  if (result.status !== 'identical-exports') process.exitCode = 2
}
