export function isExternalLogo(logo: string): boolean {
  return /^https?:\/\//i.test(logo)
}

/** Where to point an <img>: the external URL as-is, or the logos route. */
export function logoUrl(logo: string): string {
  return isExternalLogo(logo) ? logo : `/api/logos/${encodeURIComponent(logo)}`
}
