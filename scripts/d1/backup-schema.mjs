import {chatSchema,chatTables} from '../../lib/chat/schema.mjs'
import {previousShipmentSchema,previousShipmentTable,shipmentSchema,shipmentTable} from '../../lib/shipments/schema.mjs'
import {shipmentInvoiceIndexes} from '../../lib/shipments/accounting-schema.mjs'
const normalize=value=>value.replace(/\s+/g,' ').trim().replace(/;$/,'')
const same=(left,right)=>JSON.stringify(left.map(normalize).sort())===JSON.stringify(right.map(normalize).sort())
/** Only reviewed module schemas may extend the signed-off snapshot. */
export function reviewedBackupSchema(spec,actualDDL){
  if (![23, 26, 27].includes(spec.tables.length)) throw Error('Unreviewed schema')
  for (const table of spec.tables) {
    const shipmentColumns = shipmentSchema.every(sql => spec.ddl.some(entry => normalize(entry) === normalize(sql)))
      ? shipmentTable.columns : previousShipmentTable.columns
    const expected = chatTables.includes(table.name) ? ['id', 'data', 'revision']
      : table.name === shipmentTable.name ? shipmentColumns : null
    if (expected && JSON.stringify(table.columns) !== JSON.stringify(expected)) throw Error('Unreviewed module columns')
  }
  if (same(spec.ddl, actualDDL)) return spec
  const extensions = [...chatSchema, ...previousShipmentSchema, ...shipmentSchema, ...shipmentInvoiceIndexes]
  const extensionTables = [...chatTables, shipmentTable.name]
  const baseDDL=spec.ddl.filter(sql=>!extensions.some(extension=>normalize(extension)===normalize(sql)))
  const baseTables=spec.tables.filter(table=>!extensionTables.includes(table.name))
  if(baseTables.length!==23)throw Error('Schema mismatch')
  const withChat = {
    ddl: [...baseDDL, ...chatSchema],
    tables: [...baseTables, ...chatTables.map(name => ({name, columns: ['id','data','revision']}))],
  }
  const layouts = [
    {ddl: baseDDL, tables: baseTables},
    withChat,
    {ddl: [...withChat.ddl, ...previousShipmentSchema], tables: [...withChat.tables, previousShipmentTable]},
    {ddl: [...withChat.ddl, ...shipmentSchema], tables: [...withChat.tables, shipmentTable]},
  ]
  const reviewedLayouts = layouts.flatMap(candidate => [candidate,
    ...(candidate.tables.some(table => table.name === shipmentTable.name)
      ? shipmentInvoiceIndexes.map((_, index) => ({ ...candidate, ddl: [...candidate.ddl, ...shipmentInvoiceIndexes.slice(0, index + 1)] })) : []),
  ])
  const layout = reviewedLayouts.find(candidate => same(candidate.ddl, actualDDL))
  if (!layout) throw Error('Schema mismatch')
  return {...spec, ...layout}
}
