import { lstat, open, readdir, realpath } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'
import { isSafeApplicationId } from './validate-pack'

// Bounded, read-only access to <resumesRoot>/job-hunt/sanas/*.json. Only regular files
// directly inside the pack folder are read; symlinks, junctions and anything resolving
// outside the folder are refused. Sanas never creates or writes anything in the resumes tree.

export const PACK_SUBDIR = ['job-hunt', 'sanas'] as const
export const PACK_FILE_MAX_BYTES = 2 * 1024 * 1024
export const PACK_FILES_MAX = 500

export type PackRead =
  | { stem: string; ok: true; raw: unknown }
  | { stem: string; ok: false; error: string; retryable: boolean }

export interface PackFolderListing {
  state: 'ok' | 'missing' | 'unreadable'
  error: string | null
  files: PackRead[]
  /** More files than PACK_FILES_MAX; the rest are not read. */
  limited: boolean
}

function inside(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

function code(e: unknown): string {
  return (e as NodeJS.ErrnoException)?.code ?? ''
}

/** The canonical pack folder, or why it cannot be used. */
async function packFolder(
  root: string,
): Promise<{ dir: string } | { state: 'missing' | 'unreadable'; error: string | null }> {
  let realRoot: string
  let dir: string
  try {
    realRoot = await realpath(root)
    dir = await realpath(join(realRoot, ...PACK_SUBDIR))
  } catch (e) {
    if (code(e) === 'ENOENT' || code(e) === 'ENOTDIR') return { state: 'missing', error: null }
    return { state: 'unreadable', error: 'The interview pack folder could not be opened.' }
  }
  if (!inside(realRoot, dir))
    return {
      state: 'unreadable',
      error: 'The interview pack folder points outside the resumes folder.',
    }
  return { dir }
}

/** Reads one pack file with a size bound; a file that changes or disappears while being
 *  read is a retryable error. */
async function readOne(dir: string, stem: string): Promise<PackRead> {
  const path = join(dir, `${stem}.json`)
  const fail = (error: string, retryable = false): PackRead => ({
    stem,
    ok: false,
    error,
    retryable,
  })
  try {
    const info = await lstat(path)
    if (!info.isFile()) return fail('Not a regular file.')
    if (!inside(dir, await realpath(path)))
      return fail('The file resolves outside the pack folder.')
    if (info.size > PACK_FILE_MAX_BYTES) return fail('The pack is larger than 2 MiB.')
    const handle = await open(path, 'r')
    let bytes: Buffer
    try {
      // one byte more than expected, so growth while reading is noticed
      const buffer = Buffer.alloc(info.size + 1)
      let length = 0
      for (;;) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
        if (bytesRead === 0) break
        length += bytesRead
        if (length > info.size) return fail('The pack changed while it was being read.', true)
      }
      const after = await handle.stat()
      if (after.size !== length || after.mtimeMs !== info.mtimeMs)
        return fail('The pack changed while it was being read.', true)
      bytes = buffer.subarray(0, length)
    } finally {
      await handle.close()
    }
    try {
      return { stem, ok: true, raw: JSON.parse(bytes.toString('utf8').replace(/^﻿/, '')) }
    } catch {
      return fail('The pack is not valid JSON.')
    }
  } catch (e) {
    if (code(e) === 'ENOENT') return fail('The pack disappeared while it was being read.', true)
    return fail('The pack could not be read.', code(e) === 'EBUSY')
  }
}

/** Every `.json` pack in the folder, up to `maxFiles` (more sets `limited`). A missing
 *  folder is an empty state. */
export async function listPackFiles(
  root: string,
  maxFiles = PACK_FILES_MAX,
): Promise<PackFolderListing> {
  const folder = await packFolder(root)
  if (!('dir' in folder)) return { ...folder, files: [], limited: false }
  let names: string[]
  try {
    names = (await readdir(folder.dir)).filter((n) => n.toLowerCase().endsWith('.json')).sort()
  } catch {
    return {
      state: 'unreadable',
      error: 'The interview pack folder could not be listed.',
      files: [],
      limited: false,
    }
  }
  const limited = names.length > maxFiles
  const files: PackRead[] = []
  const seen = new Map<string, number>()
  for (const name of names.slice(0, maxFiles)) {
    const stem = name.slice(0, -'.json'.length)
    if (!isSafeApplicationId(stem)) {
      files.push({
        stem: name.slice(0, -'.json'.length).slice(0, 128),
        ok: false,
        error: 'Unsafe pack file name.',
        retryable: false,
      })
      continue
    }
    const key = stem.toLowerCase()
    if (seen.has(key)) {
      const dup: PackRead = {
        stem,
        ok: false,
        error: 'Duplicate application ID.',
        retryable: false,
      }
      files[seen.get(key)!] = { ...dup, stem: files[seen.get(key)!].stem }
      files.push(dup)
      continue
    }
    seen.set(key, files.length)
    files.push(await readOne(folder.dir, stem))
  }
  return { state: 'ok', error: null, files, limited }
}

/** Re-reads one listed pack by its (already validated) application ID. */
export async function readPackFile(root: string, applicationId: string): Promise<PackRead> {
  if (!isSafeApplicationId(applicationId))
    return { stem: '', ok: false, error: 'Invalid application ID.', retryable: false }
  const folder = await packFolder(root)
  if (!('dir' in folder))
    return {
      stem: applicationId,
      ok: false,
      error: folder.error ?? 'The interview pack folder is missing.',
      retryable: folder.state === 'missing',
    }
  return readOne(folder.dir, applicationId)
}
