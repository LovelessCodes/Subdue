/**
 * The `?next=` target a signed-out visitor should land on after auth.
 * Only same-origin paths, so a crafted link cannot bounce someone off-site.
 */
export function nextPath(search: string): string | null {
  const value = new URLSearchParams(search).get('next')
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return null
  }
  return value
}
