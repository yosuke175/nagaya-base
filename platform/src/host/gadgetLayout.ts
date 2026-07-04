// 棚のフローティング窓の配置（位置・サイズ）を保存する。
// 画面サイズは端末ごとに違うので、レイアウトは端末ごと（localStorage）に持つのが自然。
// キーはガジェットID。

export interface WinRect {
  x: number
  y: number
  w: number
  h: number
}

const KEY = 'gadget-layouts'

type Store = Record<string, WinRect>

function isRect(value: unknown): value is WinRect {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (
    typeof r.x === 'number' &&
    typeof r.y === 'number' &&
    typeof r.w === 'number' &&
    typeof r.h === 'number'
  )
}

export function loadLayouts(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    const out: Store = {}
    for (const [id, rect] of Object.entries(parsed)) if (isRect(rect)) out[id] = rect
    return out
  } catch {
    return {}
  }
}

export function saveLayout(id: string, rect: WinRect): void {
  const all = loadLayouts()
  all[id] = rect
  localStorage.setItem(KEY, JSON.stringify(all))
}

export function clearLayouts(): void {
  localStorage.removeItem(KEY)
}
