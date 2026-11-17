import { digest } from './cloud-backup-core.mjs'

export function createFirstLaunchFileWorker(objects) {
  return { async fetch(request, env) {
    const authorization = request.headers.get('authorization') || ''
    if (!/^[a-f0-9]{64}$/.test(env.TRANSFER_KEY || '') || authorization !== `Bearer ${env.TRANSFER_KEY}` || request.method !== 'POST') return new Response('Not found', { status: 404 })
    const match = /^\/copy\/(\d{1,3})$/.exec(new URL(request.url).pathname)
    const object = match && objects[Number(match[1])]
    if (!object) return new Response('Not found', { status: 404 })
    try {
      let destination = await env.DESTINATION.get(object.destinationKey)
      if (!destination) {
        const source = await env.SOURCE.get(object.destinationKey)
        if (!source || source.size !== object.size) throw new Error('Source mismatch')
        const bytes = new Uint8Array(await source.arrayBuffer())
        if (bytes.length !== object.size || await digest(bytes) !== object.sha256) throw new Error('Source checksum mismatch')
        await env.DESTINATION.put(object.destinationKey, bytes, { onlyIf: { etagDoesNotMatch: '*' }, customMetadata: { sha256: object.sha256 }, httpMetadata: { contentType: 'application/octet-stream' } })
        destination = await env.DESTINATION.get(object.destinationKey)
      }
      if (!destination || destination.size !== object.size || destination.customMetadata?.sha256 !== object.sha256 || await digest(new Uint8Array(await destination.arrayBuffer())) !== object.sha256) throw new Error('Destination mismatch')
      return Response.json({ verified: true, index: Number(match[1]), bytes: object.size }, { headers: { 'cache-control': 'no-store' } })
    } catch { return Response.json({ verified: false, reviewRequired: true }, { status: 409, headers: { 'cache-control': 'no-store' } }) }
  } }
}
