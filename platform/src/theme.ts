// Per-user console theming (per-device, localStorage). Drives the CSS variables
// declared in index.css:
//   --accent               primary actions / active tab / top border
//   --nb-navy/terra/sage/gold/ink   palette used across the UI
//   --nb-cream             wallpaper base color
//   --nb-texture           wallpaper texture image (url(...) / none / default)
//   --nb-texture-size      texture tile size
// Stored per browser; cross-device sync (profiles.settings) is a later step.

const THEME_KEY = 'platform-theme'

export interface ThemePrefs {
  accent: string
  navy: string
  terra: string
  sage: string
  gold: string
  cream: string
  ink: string
  /** テクスチャ画像: 未設定=既定の和紙 / 'none'=無地 / data-URL=アップロード画像 */
  texture?: string
  /** テクスチャの表示サイズ(px) */
  textureSize: number
  /**
   * 自分の部屋のトップ背景（高さ120pxの帯）。
   * 未設定=既定サンプル / 'none'=無し / 'sample:<id>'=同梱サンプル / data-URL=アップロード画像
   */
  roomBg?: string
}

/** 部屋トップ背景の同梱サンプル（public/img/room/<id>.webp）。 */
export const ROOM_SAMPLES: { id: string; label: string }[] = [
  { id: 'nagaya-rouka01', label: '長屋の廊下①' },
  { id: 'nagaya-rouka02', label: '長屋の廊下②' },
  { id: 'nagaya-gaikan01', label: '長屋の外観①' },
  { id: 'nagaya-gaikan02', label: '長屋の外観②' },
  { id: 'tanako01', label: '店子①' },
  { id: 'tanako02', label: '店子②' },
  { id: 'tanako03', label: '店子③' },
  { id: 'tanako04', label: '店子④' },
  { id: 'syokunin01', label: '職人①' },
  { id: 'syokunin02', label: '職人②' },
  { id: 'syokunin03', label: '職人③' },
  { id: 'syokunin04', label: '職人④' },
  { id: 'ooya01', label: '大家①' },
  { id: 'ooya02', label: '大家②' },
]

const DEFAULT_ROOM_SAMPLE = 'nagaya-rouka01'

/** roomBg 値 → CSS の background-image 値（url(...) または none）。 */
export function roomBgImage(roomBg?: string): string {
  if (roomBg === 'none') return 'none'
  if (typeof roomBg === 'string' && roomBg.startsWith('data:')) return `url('${roomBg}')`
  if (typeof roomBg === 'string' && roomBg.startsWith('sample:'))
    return `url('/img/room/${roomBg.slice('sample:'.length)}.webp')`
  return `url('/img/room/${DEFAULT_ROOM_SAMPLE}.webp')` // 未設定 = 既定サンプル
}

export const DEFAULT_THEME: ThemePrefs = {
  accent: '#292524',
  navy: '#1e2c4a',
  terra: '#b85042',
  sage: '#6e8f7c',
  gold: '#c9a15a',
  cream: '#f1eee3',
  ink: '#2d2a26',
  texture: undefined,
  textureSize: 520,
}

export interface ThemePreset {
  id: string
  name: string
  accent: string
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'sumi', name: '墨', accent: '#292524' },
  { id: 'ai', name: '藍', accent: '#1e40af' },
  { id: 'matsu', name: '松', accent: '#166534' },
  { id: 'kaki', name: '柿', accent: '#c2410c' },
  { id: 'ume', name: '梅', accent: '#be185d' },
  { id: 'fuji', name: '藤', accent: '#6d28d9' },
]

/** 色編集の対象（ThemeEditor が使う）。cream（壁紙）は別枠なのでここには含めない。 */
export const THEME_COLOR_FIELDS: { key: keyof ThemePrefs; label: string; hint: string }[] = [
  { key: 'accent', label: 'アクセント', hint: 'ボタン・選択中タブ・上枠' },
  { key: 'navy', label: '見出しの色', hint: '見出し・強調テキスト' },
  { key: 'terra', label: '差し色（朱）', hint: '職人ラベルなど' },
  { key: 'sage', label: '緑', hint: '補助色' },
  { key: 'gold', label: '金', hint: '装飾・枠' },
  { key: 'ink', label: '文字色', hint: '本文の色' },
]

const isHex = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)

export function loadTheme(): ThemePrefs {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<ThemePrefs>) : {}
    const theme: ThemePrefs = { ...DEFAULT_THEME }
    for (const key of ['accent', 'navy', 'terra', 'sage', 'gold', 'cream', 'ink'] as const) {
      if (isHex(parsed[key])) theme[key] = parsed[key] as string
    }
    if (
      typeof parsed.textureSize === 'number' &&
      parsed.textureSize >= 80 &&
      parsed.textureSize <= 2000
    ) {
      theme.textureSize = parsed.textureSize
    }
    if (parsed.texture === 'none' || (typeof parsed.texture === 'string' && parsed.texture.startsWith('data:'))) {
      theme.texture = parsed.texture
    }
    if (
      parsed.roomBg === 'none' ||
      (typeof parsed.roomBg === 'string' &&
        (parsed.roomBg.startsWith('sample:') || parsed.roomBg.startsWith('data:')))
    ) {
      theme.roomBg = parsed.roomBg
    }
    return theme
  } catch {
    return { ...DEFAULT_THEME }
  }
}

export function applyTheme(theme: ThemePrefs): void {
  const style = document.documentElement.style
  style.setProperty('--accent', theme.accent)
  style.setProperty('--nb-navy', theme.navy)
  style.setProperty('--nb-terra', theme.terra)
  style.setProperty('--nb-sage', theme.sage)
  style.setProperty('--nb-gold', theme.gold)
  style.setProperty('--nb-cream', theme.cream)
  style.setProperty('--nb-ink', theme.ink)
  style.setProperty('--nb-texture-size', `${theme.textureSize}px`)
  // 自分の部屋のトップ背景（InfoSlot 帯が var(--nb-room-bg) で参照）
  style.setProperty('--nb-room-bg', roomBgImage(theme.roomBg))
  if (theme.texture === 'none') {
    style.setProperty('--nb-texture', 'none')
  } else if (typeof theme.texture === 'string' && theme.texture.startsWith('data:')) {
    style.setProperty('--nb-texture', `url('${theme.texture}')`)
  } else {
    // 未設定 → CSS の既定（var の第2引数の和紙）にフォールバック
    style.removeProperty('--nb-texture')
  }
}

export function saveTheme(theme: ThemePrefs): void {
  localStorage.setItem(THEME_KEY, JSON.stringify(theme))
  applyTheme(theme)
}

export function resetTheme(): ThemePrefs {
  const theme = { ...DEFAULT_THEME }
  localStorage.removeItem(THEME_KEY)
  applyTheme(theme)
  return theme
}
