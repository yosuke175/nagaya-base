// 棚のフローティング窓（ガジェット・案内AI）の配置（位置・サイズ）を保存する。
// 位置は「画面中央からのオフセット」で記録する。左上原点(x,y)のまま保存すると、
// ブラウザの横幅を変えた（4Kで2枚並べる等）ときに配置が丸ごと画面外にずれてしまう
// ため、常に画面中央を基準にし、読み書きの都度いまのビューポート幅で絶対座標に
// 変換する。キーはガジェットID（案内AIは GUIDE_ID）。
//
// 呼び出し側（App.tsx の棚・GuideAssistant）は、保存形式(CenterRect)をそのまま
// state に持ち、描画のたびに現在のビューポート幅で絶対座標へ変換する。resize の
// たびに「幅が変わった→保存し直す→読み直す」という一拍遅れる経路を挟むと、
// リサイズ中に位置がガタつく（ブレる）ため、必ず「描画時に毎回その場で計算」する。

export interface WinRect {
  x: number
  y: number
  w: number
  h: number
}

/** 保存形式: x の代わりに「画面中央からのオフセット」cx を持つ。 */
export interface CenterRect {
  cx: number
  y: number
  w: number
  h: number
}

const KEY = 'gadget-layouts'

type Store = Record<string, CenterRect>

function isCenterRect(value: unknown): value is CenterRect {
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
    for (const [id, rect] of Object.entries(parsed)) if (isCenterRect(rect)) out[id] = rect
    return out
  } catch {
    return {}
  }
}

/** 中央基準の矩形を、指定のビューポート幅で絶対座標に変換する（描画のたびに呼ぶ）。 */
export function rectFromCenter(c: CenterRect, viewportWidth: number): WinRect {
  return { x: viewportWidth / 2 + c.cx, y: c.y, w: c.w, h: c.h }
}

/** 絶対座標を、指定のビューポート幅で中央基準の矩形に変換する（ドラッグ確定時などに呼ぶ）。 */
export function centerFromRect(rect: WinRect, viewportWidth: number): CenterRect {
  return { cx: rect.x - viewportWidth / 2, y: rect.y, w: rect.w, h: rect.h }
}

/** 保存済みレイアウト（中央基準の生データ）をそのまま返す。描画時に rectFromCenter で変換する。 */
export function loadLayoutsRaw(): Record<string, CenterRect> {
  return readStore()
}

/** 中央基準の矩形をそのまま保存する。 */
export function saveLayoutRaw(id: string, center: CenterRect): void {
  const store = readStore()
  store[id] = center
  localStorage.setItem(KEY, JSON.stringify(store))
}

/** 保存済みレイアウトを、指定（既定=現在）のビューポート幅で絶対座標(WinRect)に変換して返す。 */
export function loadLayouts(viewportWidth: number = window.innerWidth): Record<string, WinRect> {
  const out: Record<string, WinRect> = {}
  for (const [id, c] of Object.entries(readStore())) out[id] = rectFromCenter(c, viewportWidth)
  return out
}

/** 絶対座標(WinRect)を、画面中央からのオフセットに変換して保存する。 */
export function saveLayout(id: string, rect: WinRect, viewportWidth: number = window.innerWidth): void {
  saveLayoutRaw(id, centerFromRect(rect, viewportWidth))
}

export function clearLayouts(): void {
  localStorage.removeItem(KEY)
}
