// ADR-012 Phase 2: 作りかけガジェットの「部屋プレビュー」用の純粋ヘルパ。
// /preview/<owner>/<branch>/<gadgetId>/<...file> を、本人の GitHub fork の
// raw ソースに対応づける。ルート本体（[[path]].ts）から分離してテスト可能にする。

export interface PreviewTarget {
  owner: string
  branch: string
  gadgetId: string
  /** gadgets/<id>/ 配下の相対ファイルパス（既定 index.html） */
  filePath: string
}

// GitHub ユーザー名: 英数字とハイフン、先頭は英数字、最大39文字。
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
// ブランチ名: プレビューでは簡単のためスラッシュ無しに限定（パス分割の曖昧さ回避）。
const BRANCH_RE = /^[A-Za-z0-9._-]{1,255}$/
// ガジェットID: docs/gadget-spec.md §2（半角英小文字・数字・ハイフン、3〜40）。
const GADGET_ID_RE = /^[a-z0-9-]{3,40}$/
// ファイルパスの各要素。'..' やスラッシュ・バックスラッシュを弾く。
const FILE_SEG_RE = /^[A-Za-z0-9._-]+$/

/**
 * catch-all の path セグメント配列（/preview/ 以降）を検証して対象に変換。
 * 不正なら null（呼び出し側で 400/404）。パストラバーサルは弾く。
 */
export function parsePreviewPath(segments: string[]): PreviewTarget | null {
  if (!Array.isArray(segments) || segments.length < 3) return null
  const [owner, branch, gadgetId, ...rest] = segments
  if (!OWNER_RE.test(owner)) return null
  if (!BRANCH_RE.test(branch)) return null
  if (!GADGET_ID_RE.test(gadgetId)) return null
  const fileSegs = rest.length === 0 ? ['index.html'] : rest
  if (fileSegs.length > 12) return null
  for (const seg of fileSegs) {
    if (seg === '..' || seg === '.' || !FILE_SEG_RE.test(seg)) return null
  }
  return { owner, branch, gadgetId, filePath: fileSegs.join('/') }
}

/** 本人 fork の raw ソースURL（fork はリポジトリ名を継ぐので repo 名は固定）。 */
export function rawSourceUrl(repo: string, t: PreviewTarget): string {
  return `https://raw.githubusercontent.com/${t.owner}/${repo}/${t.branch}/gadgets/${t.gadgetId}/${t.filePath}`
}

const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
}

export function contentTypeFor(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return CONTENT_TYPES[ext] ?? 'application/octet-stream'
}

export function isHtml(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.html')
}

/**
 * プレビューHTMLに付ける CSP。肝は `sandbox allow-scripts`:
 * これでプレビュー文書は（iframe内でも、URL直開きの最上位でも）不透明オリジンの
 * サンドボックスになり、未レビューの fork コードがプラットフォームのセッション/
 * localStorage に触れられない。connect-src はガジェット宣言の baseUrls のみ許可。
 */
export function previewCsp(extraConnectSrc: string[]): string {
  return [
    'sandbox allow-scripts',
    "default-src 'none'",
    "script-src 'unsafe-inline' 'self'",
    "style-src 'unsafe-inline' 'self'",
    "img-src 'self' data:",
    ["connect-src 'self'", ...extraConnectSrc].join(' '),
  ].join('; ')
}

/** manifest.externalServices から https の連携先だけを取り出す（csp.ts と同方針）。 */
export function manifestConnectSrc(manifest: unknown): string[] {
  const services =
    manifest && typeof manifest === 'object' && Array.isArray((manifest as { externalServices?: unknown }).externalServices)
      ? ((manifest as { externalServices: Array<{ baseUrls?: string[]; baseUrl?: string }> }).externalServices)
      : []
  const urls: string[] = []
  for (const service of services) {
    const declared =
      service.baseUrls && service.baseUrls.length > 0 ? service.baseUrls : service.baseUrl ? [service.baseUrl] : []
    for (const raw of declared) {
      const url = String(raw).trim().replace(/\/+$/, '')
      if (url.startsWith('https://') && !urls.includes(url)) urls.push(url)
    }
  }
  return urls
}
