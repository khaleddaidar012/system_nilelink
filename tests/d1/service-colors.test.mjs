import test from 'node:test'
import assert from 'node:assert/strict'
import {serviceStyle,serviceColorKey} from '../../lib/requests/service-colors.ts'
const rgb=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16))
const luminance=color=>color.map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
test('neutral labels and service-colored completion icons retain accessible contrast in both themes',()=>{
 for(const key of ['sea_freight','air_freight','land_freight','inland_transportation','customs_clearance','warehousing','general_inquiry']){
  const style=serviceStyle(key),light=style['--service-light'],tone=style['--service-tone']
  assert.ok(contrast(rgb('#334155'),rgb('#FFFFFF'))>=4.5,key+' light text')
  assert.ok(contrast(rgb('#E2E8F0'),rgb('#0F172A'))>=4.5,key+' dark text')
  assert.ok(contrast(rgb(tone),rgb('#F2EEE6'))>=3,key+' light check')
  assert.ok(contrast(rgb(tone),rgb('#FFFFFF'))>=3,key+' light marker')
  assert.ok(contrast(rgb(light),rgb('#161616'))>=3,key+' dark check')
 }
 assert.ok(contrast(rgb('#923F24'),rgb('#FBE9DE'))>=4.5,'UCR waiting light')
 assert.ok(contrast(rgb('#F3B89A'),rgb('#3B2A22'))>=4.5,'UCR waiting dark')
})
test('aliases share identity while inland transport remains separate from land freight',()=>{
 assert.equal(serviceColorKey('ocean_freight'),serviceColorKey('sea_freight'))
 assert.equal(serviceColorKey('freight_booking'),serviceColorKey('sea_freight'))
 assert.deepEqual(serviceStyle('storage'),serviceStyle('warehousing'))
 assert.deepEqual(serviceStyle('land_transport'),serviceStyle('land_freight'))
 assert.notEqual(serviceColorKey('inland_transportation'),serviceColorKey('land_freight'))
 assert.equal(serviceColorKey('unknown-service'),'general')
})
