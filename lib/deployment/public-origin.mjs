// Exact user-approved hosts; never derive trusted origins from request headers.
export const canonicalPublicOrigin = 'https://nilelinklogistics.com'
export const legacyWorkerOrigin = 'https://nilelink-system.mohamedznaty55.workers.dev'
export const approvedPublicOrigins = Object.freeze([canonicalPublicOrigin, legacyWorkerOrigin])
