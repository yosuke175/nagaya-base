// Per-user console theming: the accent color drives primary buttons, the
// active tab, and the header bar via the --accent CSS variable (index.css).
// Stored per browser for now; syncing to a profiles.settings column (so the
// theme follows the user across devices) is a later iteration.
const THEME_KEY = 'platform-theme'
const DEFAULT_ACCENT = '#292524'

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

export function loadAccent(): string {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    const parsed = raw ? (JSON.parse(raw) as { accent?: string }) : null
    return typeof parsed?.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.accent)
      ? parsed.accent
      : DEFAULT_ACCENT
  } catch {
    return DEFAULT_ACCENT
  }
}

export function applyAccent(accent: string): void {
  document.documentElement.style.setProperty('--accent', accent)
}

export function saveAccent(accent: string): void {
  localStorage.setItem(THEME_KEY, JSON.stringify({ accent }))
  applyAccent(accent)
}
