import fs from 'node:fs';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const origin='https://nilelinklogistics.com',urls=new Set();
for(const page of ['/ar','/ar/services','/ar/about','/en/login']){
 const r=await fetch(origin+page,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);const html=await r.text();
 for(const m of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)){if(m[1].startsWith('data:'))continue;const url=new URL(m[1].replaceAll('&amp;','&'),origin);assert.equal(url.origin,origin);assert.ok(!url.pathname.endsWith('.jpg'),'Unoptimized photo still used on '+page);urls.add(url.href);}
}
const images=await Promise.all([...urls].map(async url=>{const r=await fetch(url,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);assert.ok(r.headers.get('content-type')?.startsWith('image/'));const bytes=Buffer.from(await r.arrayBuffer());const info=await sharp(bytes).metadata();await sharp(bytes).resize(16,16).png().toBuffer();return {url,status:r.status,bytes:bytes.length,format:info.format,decoded:true};}));
const report={checkedAt:new Date().toISOString(),allPublicImagesValid:true,images};fs.writeFileSync('.private/image-optimization-20261026/live-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
