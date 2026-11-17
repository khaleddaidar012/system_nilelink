/** Existing Mongo download fallback, without rewriting any historical fields.
 * @param {Record<string, unknown>} document
 * @returns {string | null}
 */
export function documentStorageKey(document) {
  if (typeof document.storageKey === 'string' && document.storageKey) return document.storageKey
  if (document.storageKey != null && document.storageKey !== '') return null
  const { customerId, storedFileName } = document
  if (typeof customerId !== 'string' || !/^[a-f\d]{24}$/i.test(customerId) || typeof storedFileName !== 'string' || !storedFileName || storedFileName === '.' || storedFileName === '..' || /[/\\:\x00-\x1f]/.test(storedFileName)) return null
  return `clients/${customerId}/documents/${storedFileName}`
}
