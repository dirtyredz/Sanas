// Ingress checks for screen-capture IPC. The renderer may only name a meeting and a
// main-issued draft token: never a path, a desktop source ID or image data.

/** Draft tokens are main-generated UUIDs. */
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function requireCaptureToken(value: unknown): string {
  if (typeof value !== 'string' || !TOKEN.test(value))
    throw new Error('Invalid screen attachment reference.')
  return value
}
