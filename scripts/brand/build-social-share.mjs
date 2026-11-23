import fs from 'node:fs/promises'
import sharp from 'sharp'

// Render the approved outlined lockup, without substituting its letterforms.
const logo = await fs.readFile('public/brand/nilelink/logos/lockup-en-on-dark.svg', 'utf8')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#161616"/><svg x="80" y="180" width="820" height="157" viewBox="0 0 334.37 64">${logo.replace(/<svg[^>]*>|<\/svg>/g, '')}</svg><text x="80" y="405" font-family="Arial, sans-serif" font-size="28" fill="#F2EEE6">DAM → WORLD · SEA · AIR · LAND · CUSTOMS</text><rect y="550" width="1200" height="80" fill="#A4492A"/>${Array.from({length:20},(_,i)=>`<rect x="${i*60+37}" y="550" width="23" height="80" fill="#8E3E23"/>`).join('')}</svg>`
await fs.mkdir('public/brand', {recursive:true})
await sharp(Buffer.from(svg)).png().toFile('public/brand/social-share.png')
console.log('Created brand social share image: 1200×630')
