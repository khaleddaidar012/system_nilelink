export function usableAccountDocument(doc: { entityType?: string; status?: string; isArchived?: boolean; expiryDate?: string | Date | null }) {
  return doc.entityType !== "CustomerRequest" && !doc.isArchived &&
    ["approved", "expiring_soon"].includes(doc.status || "") &&
    (!doc.expiryDate || new Date(doc.expiryDate).getTime() > Date.now())
}
