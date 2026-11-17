const formats = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const
export function avatarExtension(bytes: Uint8Array, mime: string): string | null {
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) return null
  const match = mime === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mime === "image/png" ? [137,80,78,71,13,10,26,10].every((byte,index)=>bytes[index]===byte)
    : mime === "image/webp" ? Buffer.from(bytes.slice(0,4)).toString() === "RIFF" && Buffer.from(bytes.slice(8,12)).toString() === "WEBP" : false
  return match ? formats[mime as keyof typeof formats] : null
}
