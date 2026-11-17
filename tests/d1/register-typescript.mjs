// Resolve the same aliases/extensions as Next.js while using Node's built-in
// TypeScript stripping. Production resolution is unaffected by this test hook.
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import ts from 'typescript'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server' || specifier === 'next/headers') return nextResolve(specifier + '.js', context)
    let candidate
    if (specifier.startsWith('@/')) candidate = path.join(root, specifier.slice(2))
    else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:') && !path.extname(specifier)) {
      candidate = fileURLToPath(new URL(specifier, context.parentURL))
    }
    if (candidate) {
      for (const file of [candidate + '.ts', candidate + '.tsx', path.join(candidate, 'index.ts')]) {
        if (existsSync(file)) return nextResolve(pathToFileURL(file).href, context)
      }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.tsx')) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
      return { format: 'module', source, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})
