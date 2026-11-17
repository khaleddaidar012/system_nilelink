import { DatabaseSync } from 'node:sqlite'
import { restrictRestoreDatabase } from './rehearse-sql-export.mjs'

const identifier = name => '"' + name.replaceAll('"', '""') + '"'
function literal(value) {
  if (value === null) return 'NULL'
  if (typeof value === 'string') return `CAST(X'${Buffer.from(value).toString('hex')}' AS TEXT)`
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (value instanceof Uint8Array) return `X'${Buffer.from(value).toString('hex')}'`
  throw new Error('Unsupported SQLite export value')
}

/** Re-encode a verified dump without parsing SQL strings or altering stored values. */
export function orderSqlExport(bytes) {
  const db = new DatabaseSync(':memory:', { allowExtension: false, defensive: true })
  try {
    restrictRestoreDatabase(db)
    db.exec('PRAGMA foreign_keys=OFF')
    db.exec(Buffer.from(bytes).toString('utf8'))
    db.exec('PRAGMA foreign_keys=ON')
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Invalid source relationships')
    const objects = db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type DESC,name").all()
    if (objects.some(o => !['table', 'index'].includes(o.type))) throw new Error('Unsupported schema object')
    const tables = objects.filter(o => o.type === 'table')
    const statements = ['PRAGMA defer_foreign_keys=TRUE', ...tables.map(o => o.sql)]
    for (const table of tables) {
      const columns = db.prepare(`PRAGMA table_xinfo(${identifier(table.name)})`).all().filter(c => c.hidden === 0).map(c => c.name)
      const query = db.prepare(`SELECT ${columns.map(identifier).join(',')} FROM ${identifier(table.name)}`)
      query.setReadBigInts(true)
      for (const row of query.all()) statements.push(`INSERT INTO ${identifier(table.name)} (${columns.map(identifier).join(',')}) VALUES (${columns.map(c => literal(row[c])).join(',')})`)
    }
    statements.push(...objects.filter(o => o.type === 'index').map(o => o.sql))
    return statements.join(';\n') + ';\n'
  } finally { db.close() }
}
