// ADR-012 Phase 2: 作りかけガジェットの「部屋プレビュー」配信（方式A・gitベース）。
//
// 本人の GitHub fork（リポジトリ名は本家を継ぐ）の gadgets/<id>/ を、プラットフォーム
// 自身のオリジン配下 /preview/<owner>/<branch>/<gadgetId>/... で中継配信する。同一
// オリジンにするのは、ガジェットの SDK 読み込み（/sdk/gadget-sdk.js）と相対アセットを
// 本番と同じに動かすため。安全性は previewCsp の `sandbox allow-scripts`（不透明オリジン
// 強制＝プラットフォームのセッションに触れない）＋ GadgetFrame の iframe sandbox で担保。
//
// 制約: GET のみ／本家リポ名のみ（open-proxy 化を防ぐ）／gadgets/<id>/ 配下のみ（traversal 禁止）。
import {
  contentTypeFor,
  isHtml,
  manifestConnectSrc,
  parsePreviewPath,
  previewCsp,
  rawSourceUrl,
} from './_parse'

interface Env {
  /** 本家リポジトリ名（fork も同名）。未設定なら nagaya-base。 */
  UPSTREAM_REPO?: string
}

const MARKER = 'x-nagaya-preview'

function notFound(message: string): Response {
  return new Response(message, {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', [MARKER]: '1', 'cache-control': 'no-cache' },
  })
}

export const onRequest = async (context: {
  request: Request
  env: Env
  params: { path?: string[] | string }
}): Promise<Response> => {
  const { request, env } = context
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('method not allowed', { status: 405, headers: { [MARKER]: '1' } })
  }

  const raw = context.params.path
  const segments = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split('/') : []
  const target = parsePreviewPath(segments)
  if (!target) return notFound('プレビュー対象が不正です（/preview/<GitHubユーザー>/<ブランチ>/<道具ID>/...）')

  const repo = env.UPSTREAM_REPO && /^[A-Za-z0-9._-]{1,100}$/.test(env.UPSTREAM_REPO) ? env.UPSTREAM_REPO : 'nagaya-base'

  const upstream = await fetch(rawSourceUrl(repo, target), {
    // raw.githubusercontent は認証不要（fork は公開前提）。安全側で最小ヘッダ。
    headers: { accept: '*/*' },
  }).catch(() => null)

  if (!upstream || !upstream.ok) {
    return notFound(
      `ソースが見つかりません（${target.owner}/${repo}@${target.branch} の gadgets/${target.gadgetId}/${target.filePath}）。` +
        'GitHub の自分のリポジトリに push 済みか、ユーザー名・ブランチ・道具IDを確認してください。',
    )
  }

  const headers = new Headers({
    'content-type': contentTypeFor(target.filePath),
    'cache-control': 'no-cache',
    [MARKER]: '1',
  })

  if (isHtml(target.filePath)) {
    // HTML には CSP を付ける。連携先(connect-src)は同じ道具の manifest.json から取る。
    let extraConnect: string[] = []
    try {
      const manifestUrl = rawSourceUrl(repo, { ...target, filePath: 'manifest.json' })
      const manifestRes = await fetch(manifestUrl, { headers: { accept: 'application/json' } })
      if (manifestRes.ok) extraConnect = manifestConnectSrc(await manifestRes.json())
    } catch {
      // manifest が読めなくても、connect-src なしの安全側で配信する
    }
    headers.set('content-security-policy', previewCsp(extraConnect))
    const body = await upstream.text()
    return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers })
  }

  // 非HTML（JS/CSS/画像等）は同一オリジンで素通し。SDK 読み込み等は /sdk 側の CORS で解決。
  const body = request.method === 'HEAD' ? null : await upstream.arrayBuffer()
  return new Response(body, { status: 200, headers })
}
