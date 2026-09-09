/** IPC rejections arrive as "Error invoking remote method 'x': Error: <msg>" — keep <msg>,
 *  which is the readable message the main-process service threw. */
export function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')
}
