import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {readPortCatalogue,loadCountryCatalogue,countryOptions,countryPorts,formatPort,formatCountry,locationCountry,locationMode,isCountryLocation} from '../../lib/shipments/port-catalogue.ts'
import {CountryPortPicker} from '../../components/admin/shipments/CountryPortPicker.tsx'
const index=readPortCatalogue(JSON.parse(await readFile(new URL('../../public/data/unlocode-2025-1/index.json',import.meta.url),'utf8')))
const countryFiles=await Promise.all(index.countries.map(async country=>JSON.parse(await readFile(new URL('../../public/data/unlocode-2025-1/countries/'+country.code+'.json',import.meta.url),'utf8'))))
const catalogue=readPortCatalogue({...index,ports:countryFiles.flatMap(data=>data.ports)})
const damietta=catalogue.ports.find(port=>port.code==='EGDAM'),casablanca=catalogue.ports.find(port=>port.code==='MACAS')

test('official catalogue has complete country coverage and unique country-linked port references',()=>{
 assert.equal(catalogue.countries.length,249);assert.equal(catalogue.ports.length,106056);assert.deepEqual(catalogue.modeCounts,{road:90400,sea:17520,air:9029})
 assert.equal(new Set(catalogue.ports.map(port=>port.code)).size,catalogue.ports.length)
 assert.ok(damietta);assert.ok(casablanca)
 const egypt=countryPorts(catalogue,'EG');assert.equal(egypt.length,41);assert.ok(egypt.every(port=>port.code.startsWith('EG')))
 assert.equal(countryPorts(catalogue,'').length,0);assert.equal(countryPorts(catalogue,'ZZ').length,0)
 assert.ok(countryOptions(catalogue,'ar').find(country=>country.code==='EG').label.includes('مصر'))
 assert.ok(countryOptions(catalogue,'en').find(country=>country.code==='MA').label.includes('Morocco'))
})
test('country filtering and multilingual port search do not return ports from another country',()=>{
 assert.deepEqual(countryPorts(catalogue,'EG','دمياط').map(port=>port.code),['EGDAM'])
 assert.deepEqual(countryPorts(catalogue,'EG','EGDAM').map(port=>port.code),['EGDAM'])
 assert.equal(countryPorts(catalogue,'EG','Casablanca').length,0)
 assert.ok(countryPorts(catalogue,'MA','الدار البيضاء').some(port=>port.code==='MACAS'))
 const accented=catalogue.ports.find(port=>port.ascii)
 assert.ok(countryPorts(catalogue,accented.code.slice(0,2),accented.ascii,accented.modes[0]).some(port=>port.code===accented.code))
})
test('country and port choices round-trip through existing location text, preserving legacy names',()=>{
 assert.equal(locationCountry(formatPort(damietta),catalogue),'EG')
 assert.equal(locationCountry(formatPort(casablanca),catalogue),'MA')
 const countryOnly=formatCountry(catalogue.countries.find(country=>country.code==='EG'))
 assert.equal(isCountryLocation(countryOnly),true);assert.equal(locationCountry(countryOnly,catalogue),'EG')
 assert.equal(locationCountry('Damietta',catalogue),'EG');assert.equal(locationCountry('دمياط',catalogue),'EG')
 assert.equal(locationCountry('Casablanca',{...catalogue,ports:countryPorts(catalogue,'MA')}),'MA')
 assert.equal(locationCountry('Unlisted legacy port',catalogue),'')
 const ambiguous={...catalogue,ports:[{code:'EGAAA',name:'Shared name'},{code:'MAAAA',name:'Shared name'}]}
 assert.equal(locationCountry('Shared name',ambiguous),'')
})
test('country/port form disables port selection until country is chosen and preserves old values',()=>{
 const render=value=>renderToStaticMarkup(createElement(CountryPortPicker,{id:'port_of_loading',value,catalogue,ar:true,inputClass:'input',onChange(){}}))
 const empty=render('');assert.match(empty,/<input[^>]+id="port_of_loading-port"[^>]+disabled=""/)
 assert.equal((empty.match(/role="combobox"/g)||[]).length,2)
 const chosen=render(formatPort(damietta));assert.ok(chosen.includes('Egypt (EG)'));assert.ok(chosen.includes(formatPort(damietta)))
 assert.ok(!chosen.includes(formatPort(casablanca)))
 const legacy=render('Damietta');assert.ok(legacy.includes('value="Damietta"'))

})

test('road, sea and air lists use official functions, including multimodal locations',()=>{
 assert.ok(countryPorts(catalogue,'EG','EGCAI','air').some(port=>port.code==='EGCAI'))
 assert.equal(countryPorts(catalogue,'EG','EGCAI','sea').length,0)
 assert.equal(countryPorts(catalogue,'EG','EGCAI','road').length,0)
 assert.ok(countryPorts(catalogue,'EG','EGDAM','sea').length)
 assert.ok(countryPorts(catalogue,'EG','EGDAM','road').length)
 for(const mode of ['road','sea','air'])assert.ok(countryPorts(catalogue,'US','',mode).every(port=>port.modes.includes(mode)))
 const selected=formatPort(damietta,'road');assert.equal(locationCountry(selected,catalogue),'EG');assert.equal(locationMode(selected,catalogue),'road')
 const countryOnly=formatCountry(catalogue.countries.find(c=>c.code==='EG'),'air');assert.equal(isCountryLocation(countryOnly),true);assert.equal(locationMode(countryOnly,catalogue),'air')
 const html=renderToStaticMarkup(createElement(CountryPortPicker,{id:'port_of_loading',value:selected,catalogue:index,ar:true,inputClass:'input',onChange(){}}))
 assert.match(html,/<option value="road" selected=""/);assert.ok(html.includes('منفذ الشحن البري'))
})

test('country downloads validate ownership, recover after failure and share a cached successful result',async()=>{
 const oldFetch=globalThis.fetch;let calls=0
 const egypt=countryFiles.find(data=>data.country==='EG')
 try{
  globalThis.fetch=async(url,options)=>{calls++;assert.ok(String(url).endsWith('/EG.json'));assert.equal(options.cache,'force-cache');return Response.json(calls===1?{...egypt,ports:[casablanca]}:egypt)}
  await assert.rejects(loadCountryCatalogue('../EG',index),/Invalid/)
  assert.equal(calls,0)
  await assert.rejects(loadCountryCatalogue('EG',index),/mismatch/)
  const first=await loadCountryCatalogue('EG',index),second=await loadCountryCatalogue('EG',index)
  assert.equal(first,second);assert.equal(calls,2)
  assert.ok(first.ports.every(port=>port.code.startsWith('EG')))
 }finally{globalThis.fetch=oldFetch}
})
