// 案内AI 段2 / 操作補助: guide の回答末尾に埋め込まれた「操作提案」を取り出す。
// AIは実行しない。クライアントが安全なものだけ確認ボタンにし、ユーザー承認で実行する。
// プロバイダ非依存にするため tool-calling API ではなく ```nagaya-action {…}``` タグ方式。

/** 案内AIが提案できる操作（プラットフォーム操作のみ。ガジェット内部は対象外） */
export type GuideAction =
  | { type: 'install'; gadgetId: string }
  | { type: 'open'; view: GuideView }
  | { type: 'help'; article: string }
  | { type: 'ai-settings' }

export type GuideView =
  | 'dashboard'
  | 'catalog'
  | 'residents'
  | 'help'
  | 'workshop'
  | 'announcements'
  | 'calendar'

const VIEW_ALIASES: Record<string, GuideView> = {
  dashboard: 'dashboard',
  部屋: 'dashboard',
  自分の部屋: 'dashboard',
  棚: 'dashboard',
  catalog: 'catalog',
  道具市: 'catalog',
  residents: 'residents',
  入居者: 'residents',
  help: 'help',
  案内所: 'help',
  workshop: 'workshop',
  工房: 'workshop',
  announcements: 'announcements',
  回覧板: 'announcements',
  calendar: 'calendar',
  長屋暦: 'calendar',
}

const GADGET_ID_RE = /^[a-z0-9-]{3,40}$/

function normalizeAction(raw: unknown): GuideAction | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.type === 'install' && typeof r.gadgetId === 'string' && GADGET_ID_RE.test(r.gadgetId)) {
    return { type: 'install', gadgetId: r.gadgetId }
  }
  if (r.type === 'open' && typeof r.view === 'string') {
    const view = VIEW_ALIASES[r.view]
    return view ? { type: 'open', view } : null
  }
  if (r.type === 'help' && typeof r.article === 'string' && r.article.length <= 40) {
    return { type: 'help', article: r.article }
  }
  if (r.type === 'ai-settings') return { type: 'ai-settings' }
  return null
}

/**
 * 回答から操作ブロックを取り出し、表示用テキスト（ブロック除去済み）と action を返す。
 * ブロックが無い/不正なら action は null。
 */
export function parseGuideReply(reply: string): { text: string; action: GuideAction | null } {
  const match = reply.match(/```nagaya-action\s*([\s\S]*?)```/)
  if (!match) return { text: reply.trim(), action: null }
  const text = reply.replace(match[0], '').trim()
  let action: GuideAction | null = null
  try {
    action = normalizeAction(JSON.parse(match[1].trim()))
  } catch {
    action = null
  }
  return { text, action }
}

/** 確認ボタンのラベル（world-view 語彙で表示） */
export function actionLabel(action: GuideAction): string {
  switch (action.type) {
    case 'install':
      return `「${action.gadgetId}」を自分の部屋にインストール`
    case 'open': {
      const label: Record<GuideView, string> = {
        dashboard: '自分の部屋',
        catalog: '道具市',
        residents: '入居者',
        help: '案内所',
        workshop: '工房',
        announcements: '回覧板',
        calendar: '長屋暦',
      }
      return `${label[action.view]}を開く`
    }
    case 'help':
      return '案内所の記事を開く'
    case 'ai-settings':
      return 'AI設定を開く'
  }
}
