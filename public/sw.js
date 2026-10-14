// Intentionally minimal: no caching. An offline cache for a finance app
// risks showing stale due dates, so this worker only exists so the browser
// treats Subdue as an installable PWA. Real offline support is a separate
// design decision (see the roadmap).
self.addEventListener('fetch', () => {})
