// 棚のフローティング窓（ガジェット・案内AI）の配置（位置・サイズ）を保存する。
// 位置は「画面中央からのオフセット」で記録する。左上原点(x,y)のまま保存すると、
// ブラウザの横幅を変えた（4Kで2枚並べる等）ときに配置が丸ごと画面外にずれてしまう
// ため、常に画面中央を基準にし、読み書きの都度いまのビューポート幅で絶対座標に
// 変換する。キーはガジェットID（案内AIは GUIDE_ID）。

export interface WinRect {
  x: number
  y: number
  w: number
  h: number
}

/** 保存形式: x の代わりに「画面中央からのオフセット」cx を持つ。 */
interface StoredRect {
  cx: number
  y: number
  w: number
  h: number
}

const KEY = 'gadget-layouts'

type Store = Record<string, StoredRect>

function isStoredRect(value: unknown): value is StoredRect {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (
    typeof r.cx === 'number' &&
    typeof r.y === 'number' &&
    typeof r.w === 'number' &&
    typeof r.h === 'number'
  )
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    const out: Store = {}
    for (const [id, rect] of Object.entries(parsed)) if (isStoredRect(rect)) out[id] = rect
    return out
  } catch {
    return {}
  }
}

/** 保存済みレイアウトを、指定（既定=現在）のビューポート幅で絶対座標(WinRect)に変換して返す。 */
export function loadLayouts(viewportWidth: number = window.innerWidth): Record<string, WinRect> {
  const centerX = viewportWidth / 2
  const out: Record<string, WinRect> = {}
  for (const [id, r] of Object.entries(readStore())) {
    out[id] = { x: centerX + r.cx, y: r.y, w: r.w, h: r.h }
  }
  return out
}

/** 絶対座標(WinRect)を、画面中央からのオフセットに変換して保存する。 */
export function saveLayout(id: string, rect: WinRect, viewportWidth: number = window.innerWidth): void {
  const centerX = viewportWidth / 2
  const store = readStore()
  store[id] = { cx: rect.x - centerX, y: rect.y, w: rect.w, h: rect.h }
  localStorage.setItem(KEY, JSON.stringify(store))
}

export function clearLayouts(): void {
  localStorage.removeItem(KEY)
}
