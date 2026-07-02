/**
 * CSP applied to gadget documents (ADR-001). connect-src is widened with the
 * baseUrls each gadget declares in manifest.externalServices — everything
 * else stays blocked. Used by both the dev middleware and the generated
 * Cloudflare Pages _headers (see platform/vite.config.ts).
 *
 * Kept dependency-free (no gadget-sdk import) because vite.config.ts loads
 * this file before the SDK workspace is necessarily built.
 */

export interface CspManifestLike {
  externalServices?: Array<{ baseUrls?: string[]; baseUrl?: string }>
}

/** Declared external origins: https-only, trimmed, deduplicated. */
export function manifestConnectSrc(manifest: CspManifestLike): string[] {
  const urls: string[] = []
  for (const service of manifest.externalServices ?? []) {
    const declared =
      service.baseUrls && service.baseUrls.length > 0
        ? service.baseUrls
        : service.baseUrl
          ? [service.baseUrl]
          : []
    for (const raw of declared) {
      const url = String(raw).trim().replace(/\/+$/, '')
      if (url.startsWith('https://') && !urls.includes(url)) {
        urls.push(url)
      }
    }
  }
  return urls
}

/**
 * @param selfSource CSP source for the platform origin — an explicit origin
 *   in dev (opaque-origin-safe) or 'self' in the generated _headers.
 */
export function buildGadgetCsp(selfSource: string, extraConnectSrc: string[]): string {
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${selfSource}`,
    `style-src 'unsafe-inline' ${selfSource}`,
    `img-src ${selfSource} data:`,
    [`connect-src ${selfSource}`, ...extraConnectSrc].join(' '),
  ].join('; ')
}
