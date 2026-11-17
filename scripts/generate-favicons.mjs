import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'

// Convert the existing brand artwork; no replacement logo or new artwork.
const source = 'public/images/logo.png'
const sizes = [16, 32, 48, 64, 128, 256]
const frames = []
async function circularIcon(size) {
  // A transparent square with a white disk keeps the logo visible in dark tabs.
  const artworkSize = Math.max(1, Math.round(size * 0.78))
  const artwork = await sharp(source).resize(artworkSize, artworkSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  const circle = Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`)
  return sharp(circle).composite([{ input: artwork, gravity: 'centre' }]).png().toBuffer()
}
for (const size of sizes) frames.push(await circularIcon(size))
const header = Buffer.alloc(6 + sizes.length * 16)
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4)
let offset = header.length
for (let i = 0; i < sizes.length; i++) {
  const entry = 6 + i * 16
  header[entry] = header[entry + 1] = sizes[i] === 256 ? 0 : sizes[i]
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(frames[i].length, entry + 8); header.writeUInt32LE(offset, entry + 12)
  offset += frames[i].length
}
await writeFile('app/favicon.ico', Buffer.concat([header, ...frames]))
await writeFile('public/favicon-32.png', frames[1])
await writeFile('public/apple-touch-icon.png', await circularIcon(180))
console.log('Brand favicon generated at six sizes, plus PNG and Apple touch icons.')
