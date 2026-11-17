import { readFile, readdir } from 'node:fs/promises'

/** Current migrations contain DDL statements, with no triggers or SQL strings containing semicolons. */
export async function readD1MigrationStatements() {
  const directory = new URL('../../migrations/d1/', import.meta.url)
  const files = (await readdir(directory)).filter(file => /^\d+_[a-z0-9_]+\.sql$/.test(file)).sort()
  const statements = []
  for (const file of files) {
    const sql = await readFile(new URL(file, directory), 'utf8')
    statements.push(...sql.replace(/--[^\n]*/g, '').split(';').map(statement => statement.trim()).filter(Boolean))
  }
  return statements
}
