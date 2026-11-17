import sharp from 'sharp'
import { readdir, readFile, writeFile, mkdir, access } from 'node:fs/promises'
import path from 'node:path'

const backup = '.private/image-optimization-20261026/originals'
await mkdir(backup, { recursive: true })
const photos = (await readdir('public/images')).filter(name => name.endsWith('.jpg'))
const report = []
for (const name of [...photos, 'logo.png']) {
  const original = path.join(backup, name)
  try { await access(original) } catch { await writeFile(original, await readFile(path.join('public/images', name)), { flag: 'wx' }) }
  const input = await readFile(original)
  if (name === 'logo.png') {
    const output = await sharp(input).resize({ width: 512, withoutEnlargement: true }).png({ compressionLevel: 9, effort: 10 }).toBuffer()
    await writeFile(path.join('public/images', name), output)
    report.push({ name, before: input.length, after: output.length, format: 'png' })
  } else {
    const image = () => sharp(input).rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
    const output = await image().webp({ quality: 78, effort: 6 }).toBuffer()
    const fallback = await image().jpeg({ quality: 80, mozjpeg: true }).toBuffer()
    await writeFile(path.join('public/images', name.replace(/\.jpg$/, '.webp')), output)
    if (fallback.length < input.length) await writeFile(path.join('public/images', name), fallback)
    report.push({ name, before: input.length, after: output.length, format: 'webp' })
  }
}
async function updateSources(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, item.name)
    if (item.isDirectory()) { await updateSources(filename); continue }
    if (!item.name.endsWith('.tsx')) continue
    const source = await readFile(filename, 'utf8')
    let updated = source
    for (const name of photos) updated = updated.replaceAll('/images/' + name, '/images/' + name.replace(/\.jpg$/, '.webp'))
    if (updated !== source) await writeFile(filename, updated)
  }
}
await updateSources('components')
await updateSources('app/[locale]')
const before = report.reduce((total, row) => total + row.before, 0)
const after = report.reduce((total, row) => total + row.after, 0)
const summary = { before, after, reductionPercent: Number(((1 - after / before) * 100).toFixed(1)), images: report }
await writeFile('.private/image-optimization-20261026/report.json', JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary))
