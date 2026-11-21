import test from 'node:test'
import assert from 'node:assert/strict'
import {serviceStages} from '../../lib/requests/tracking.ts'
test('release handover renames one stage while retaining key and completed history',()=>{
 const rows=serviceStages({serviceKey:'customs_clearance',trackingStages:[{stageKey:'release',labelAr:'old',labelEn:'old',status:'completed',completedAt:'2026-01-01',staffNote:'Original note'}]})
 assert.equal(rows.length,5);const stage=rows.find(row=>row.stageKey==='release');assert.equal(stage.labelAr,'تسليم الإذن / تسليم الإفراج');assert.equal(stage.labelEn,'Permit / release handover');assert.equal(stage.status,'completed');assert.equal(stage.staffNote,'Original note');assert.equal(stage.completedAt,'2026-01-01')
})
