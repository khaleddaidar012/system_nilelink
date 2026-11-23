import {test} from 'node:test'
import assert from 'node:assert/strict'
import {constructMetadata} from '../../lib/seo.ts'
import {PUBLIC_SITE_ORIGIN} from '../../lib/public/site.ts'
import sitemap from '../../app/sitemap.ts'
import robots from '../../app/robots.ts'

test('page canonical and language alternates preserve the route and approved origin',()=>{
 assert.equal(constructMetadata({title:'About NileLink'}).title.absolute,'About NileLink')
 for(const locale of ['en','ar','fr','de','it','zh','bg'])for(const path of ['','/about','/services','/request-quote','/contact']){
 const metadata=constructMetadata({title:'Localized title',description:'Localized description',locale,path})
 assert.equal(metadata.alternates.canonical,`${PUBLIC_SITE_ORIGIN}/${locale}${path}`)
 assert.equal(Object.keys(metadata.alternates.languages).length,8)
 assert.equal(metadata.alternates.languages['x-default'],`${PUBLIC_SITE_ORIGIN}/en${path}`)
 assert.equal(metadata.openGraph.url,metadata.alternates.canonical)
 assert.equal(metadata.title.absolute,'Localized title | NileLink')
 assert.equal(metadata.twitter.creator,undefined)
 }
})
test('sitemap lists only the 35 public routes and agrees with metadata alternates',()=>{
 const entries=sitemap();assert.equal(entries.length,35);assert.equal(new Set(entries.map(e=>e.url)).size,35)
 for(const entry of entries){assert.ok(entry.url.startsWith(PUBLIC_SITE_ORIGIN+'/'));assert.equal(Object.keys(entry.alternates.languages).length,8);assert.doesNotMatch(entry.url,/portal|admin|invoice|login/);assert.equal(entry.lastModified,undefined)}
})
test('robots references production sitemap and excludes private/auth/API paths',()=>{
 const value=robots();assert.equal(value.sitemap,PUBLIC_SITE_ORIGIN+'/sitemap.xml');assert.ok(value.rules.disallow.includes('/api/'))
 for(const locale of ['en','ar','fr','de','it','zh','bg'])for(const path of ['portal','admin','invoice','login'])assert.ok(value.rules.disallow.includes(`/${locale}/${path}`))
})
