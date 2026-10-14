import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { logosDir } from '../lib/paths'

export const MAX_LOGO_BYTES = 1024 * 1024

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return new TextDecoder().decode(bytes.slice(start, end))
}

const IMAGE_TYPES: {
  extension: string
  contentType: string
  matches: (bytes: Uint8Array) => boolean
}[] = [
  {
    extension: 'png',
    contentType: 'image/png',
    matches: (bytes) =>
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47,
  },
  {
    extension: 'jpg',
    contentType: 'image/jpeg',
    matches: (bytes) =>
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  {
    extension: 'gif',
    contentType: 'image/gif',
    matches: (bytes) =>
      bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46,
  },
  {
    extension: 'webp',
    contentType: 'image/webp',
    matches: (bytes) =>
      ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP',
  },
]

const CONTENT_TYPES: Record<string, string> = Object.fromEntries(
  IMAGE_TYPES.map((type) => [type.extension, type.contentType]),
)

export function detectImageExtension(bytes: Uint8Array): string | null {
  for (const type of IMAGE_TYPES) {
    if (type.matches(bytes)) {
      return type.extension
    }
  }
  return null
}

export function logoContentType(file: string): string | null {
  return CONTENT_TYPES[extname(file).slice(1).toLowerCase()] ?? null
}

export function logoFilePath(file: string): string | null {
  if (!file || basename(file) !== file || file.includes('..')) {
    return null
  }
  return resolve(logosDir(), file)
}

export function logoExists(file: string): boolean {
  const path = logoFilePath(file)
  return path !== null && existsSync(path)
}

export function saveLogo(bytes: Uint8Array, extension: string): string {
  const file = `${crypto.randomUUID()}.${extension}`
  mkdirSync(logosDir(), { recursive: true })
  writeFileSync(join(logosDir(), file), bytes)
  return file
}

export function saveImportedLogo(
  name: string,
  bytes: Uint8Array,
): string | null {
  const safe = basename(name).replace(/[^\w.-]/g, '_')
  if (
    !safe ||
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_LOGO_BYTES ||
    !detectImageExtension(bytes)
  ) {
    return null
  }
  mkdirSync(logosDir(), { recursive: true })
  writeFileSync(join(logosDir(), safe), bytes)
  return safe
}

export function removeLogo(file: string): void {
  const path = logoFilePath(file)
  if (path) {
    rmSync(path, { force: true })
  }
}
