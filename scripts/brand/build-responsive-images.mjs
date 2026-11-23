import fs from 'node:fs/promises'
import sharp from 'sharp'

// Preserve the source aspect ratio; CSS retains the approved viewport crop.
await fs.mkdir('public/brand/responsive', {recursive:true})
for (const width of [720,1280,1920]) {
  await sharp('public/brand/nilelink/images/hero-source.webp').resize({width,withoutEnlargement:true}).webp({quality:82}).toFile(`public/brand/responsive/hero-${width}.webp`)
}
console.log('Created responsive hero images without changing the frozen asset pack')
