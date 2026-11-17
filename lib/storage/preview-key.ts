/** Portable key validation shared by disk and Workers storage. Never normalize a source key. */
export function validatePreviewKey(key: string): string {
  if (!key || key.startsWith("/") || /[\\:\x00-\x1f]/.test(key) || key.split("/").some(part => part === ".." || part === "." || part === "")) throw new Error("Invalid preview storage key")
  return key
}
