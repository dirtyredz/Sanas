import { open } from 'node:fs/promises'

/** Reads a regular file of at most `maxBytes`, bounded even if it grows after stat.
 *  `messages` are the caller's user-facing errors. */
export async function readBounded(
  path: string,
  maxBytes: number,
  messages: { notFile: string; tooLarge: string },
): Promise<Buffer> {
  const file = await open(path, 'r')
  try {
    const stat = await file.stat()
    if (!stat.isFile()) throw new Error(messages.notFile)
    if (stat.size > maxBytes) throw new Error(messages.tooLarge)
    const buffer = Buffer.alloc(maxBytes + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null)
      if (!bytesRead) break
      length += bytesRead
    }
    if (length > maxBytes) throw new Error(messages.tooLarge)
    return buffer.subarray(0, length)
  } finally {
    await file.close()
  }
}
