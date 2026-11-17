import { readdir, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

/** Fail closed when a sanitized app's traces resolve to dependencies outside it. */
export async function verifyBuildTraceIsolation(workspace) {
  const root = await realpath(workspace), next = path.join(root, '.next')
  let traceFiles = 0, references = 0
  const checked = new Set()
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error('Build trace tree contains a symlink')
      if (entry.isDirectory()) {
        if (directory === next && ['cache', 'standalone'].includes(entry.name)) continue
        await visit(filename)
      } else if (entry.name.endsWith('.nft.json')) {
        const trace = JSON.parse(await readFile(filename, 'utf8'))
        if (!Array.isArray(trace.files) || ++traceFiles > 10000) throw new Error('Unexpected Next trace inventory')
        for (const file of trace.files) {
          if (typeof file !== 'string') throw new Error('Invalid Next trace entry')
          const resolved = path.resolve(directory, file)
          if (!resolved.startsWith(root + path.sep)) throw new Error('Next file trace escapes the isolated workspace')
          if (!checked.has(resolved)) {
            const actual = await realpath(resolved)
            if (!actual.startsWith(root + path.sep)) throw new Error('Next file trace resolves outside the isolated workspace')
            checked.add(resolved)
          }
          references++
        }
      }
    }
  }
  await visit(next)
  if (!traceFiles || !references) throw new Error('Next trace evidence is missing')
  return { traceFiles, references, distinctFiles: checked.size, isolated: true }
}
