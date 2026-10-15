/**
 * A logo we can point an <img> straight at: an http(s) URL, or a root-relative
 * path this app serves itself (the seeded brand marks under /brands).
 */
export function isExternalLogo(logo: string): boolean {
  return /^https?:\/\//i.test(logo) || logo.startsWith('/')
}

/** Where to point an <img>: the external URL as-is, or the logos route. */
export function logoUrl(logo: string): string {
  return isExternalLogo(logo) ? logo : `/api/logos/${encodeURIComponent(logo)}`
}
