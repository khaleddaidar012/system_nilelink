import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { orderSqlExport } from '../../scripts/d1/order-sql-export.mjs'

test('restores child-first dump with exact text, blobs, large integers and generated columns', () => {
  const sql = `CREATE TABLE child(id INTEGER PRIMARY KEY,parent_id INTEGER REFERENCES parent(id),data TEXT,b BLOB,g TEXT GENERATED ALWAYS AS (lower(data)) VIRTUAL);
INSERT INTO child(id,parent_id,data,b) VALUES(9007199254740993,1,'عربي; O''Brien',X'00ff');
CREATE TABLE parent(id INTEGER PRIMARY KEY);
INSERT INTO parent VALUES(1);
CREATE INDEX child_parent ON child(parent_id);`
  const ordered = orderSqlExport(Buffer.from(sql))
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('PRAGMA foreign_keys=ON; BEGIN;' + ordered + 'COMMIT;')
    const query = db.prepare('SELECT id,data,hex(b) AS blob,g FROM child'); query.setReadBigInts(true)
    const row = query.get()
    assert.equal(row.id, 9007199254740993n)
    assert.equal(row.data, "عربي; O'Brien")
    assert.equal(row.blob, '00FF')
    assert.equal(row.g, "عربي; o'brien")
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  } finally { db.close() }
})

test('rejects dumps with missing parent rows', () => {
  assert.throws(() => orderSqlExport(Buffer.from('CREATE TABLE p(id INTEGER PRIMARY KEY); CREATE TABLE c(id INTEGER REFERENCES p(id)); INSERT INTO c VALUES(4);')))
})
