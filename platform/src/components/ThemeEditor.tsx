import { useEffect, useRef, useState } from 'react'
import { compressImageToDataUrl } from '../lib/imageCompress'
import { useClickOutside } from '../lib/useClickOutside'
import {
  ROOM_SAMPLES,
  THEME_COLOR_FIELDS,
  THEME_PRESETS,
  loadTheme,
  resetTheme,
  saveTheme,
  type ThemePrefs,
} from '../theme'

// 見た目（テーマ）の編集。変更は即プレビュー＆この端末に保存（localStorage）。
// テクスチャ画像は Storage を使わず、圧縮した小さな data-URL で保持する。

const TEXTURE_MAX_DIM = 600
const TEXTURE_MAX_BYTES = 120 * 1024

/** アップロード画像を「元＋左右反転」の横連結タイル(webp data-URL)にする（ミラー repeat-x 用）。 */
async function mirrorTileDataUrl(file: File, targetH = 140): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = targetH / bitmap.height
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w * 2
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('画像を処理できませんでした')
  ctx.drawImage(bitmap, 0, 0, w, h) // 左: 元画像
  ctx.save() // 右: 左右反転
  ctx.translate(w * 2, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(bitmap, 0, 0, w, h)
  ctx.restore()
  bitmap.close()
  return canvas.toDataURL('image/webp', 0.82)
}

// --- 色変換（HSL <-> HEX）: 自前カラーピッカー用 -----------------------------
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100
  const ln = l / 100
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = ln - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/**
 * 色の四角（スウォッチ）をクリックすると開く自前カラーピッカー。
 * 色相・彩度・明度スライダー＋HEX入力で選び、「決定」または外側クリックで閉じる。
 * （native の <input type=color> は閉じるボタンが無く分かりにくいので使わない）
 */
function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)

  const { h, s, l } = hexToHsl(value)
  const [hexText, setHexText] = useState(value.slice(1))
  useEffect(() => setHexText(value.slice(1)), [value])

  const setHsl = (nh: number, ns: number, nl: number) => onChange(hslToHex(nh, ns, nl))

  return (
    <div className="flex items-center gap-3">
      <div className="relative" ref={ref}>
        {/* この四角だけがピッカーを開くトリガー */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={`${label}の色を選ぶ`}
          className="h-8 w-12 rounded border border-stone-300 shadow-inner"
          style={{ backgroundColor: value }}
        />
        {open && (
          <div className="absolute left-0 top-9 z-30 w-60 rounded-xl border border-stone-200 bg-white p-3 shadow-xl">
            <div className="mb-2 flex items-center gap-2">
              <span
                className="inline-block h-6 w-6 rounded border border-stone-300"
                style={{ backgroundColor: value }}
              />
              <p className="text-xs font-semibold text-stone-600">{label}の色</p>
            </div>

            <label className="block text-xs text-stone-500">
              色あい
              <input
                type="range"
                min={0}
                max={360}
                value={h}
                onChange={(e) => setHsl(Number(e.target.value), s, l)}
                className="nb-range mt-1 w-full"
                style={{
                  background:
                    'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
                }}
              />
            </label>
            <label className="mt-2 block text-xs text-stone-500">
              あざやかさ
              <input
                type="range"
                min={0}
                max={100}
                value={s}
                onChange={(e) => setHsl(h, Number(e.target.value), l)}
                className="nb-range mt-1 w-full"
                style={{
                  background: `linear-gradient(to right, hsl(${h},0%,${l}%), hsl(${h},100%,${l}%))`,
                }}
              />
            </label>
            <label className="mt-2 block text-xs text-stone-500">
              明るさ
              <input
                type="range"
                min={0}
                max={100}
                value={l}
                onChange={(e) => setHsl(h, s, Number(e.target.value))}
                className="nb-range mt-1 w-full"
                style={{
                  background: `linear-gradient(to right,#000,hsl(${h},${s}%,50%),#fff)`,
                }}
              />
            </label>

            <div className="mt-3 flex items-center gap-1">
              <span className="text-xs text-stone-500">#</span>
              <input
                value={hexText}
                maxLength={6}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
                  setHexText(cleaned)
                  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) onChange(`#${cleaned}`)
                }}
                className="w-20 rounded border border-stone-300 px-2 py-1 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-primary ml-auto rounded-lg px-3 py-1.5 text-xs font-medium"
              >
                決定
              </button>
            </div>
          </div>
        )}
      </div>
      <span className="text-xs">
        <span className="font-medium">{label}</span>
        <span className="ml-2 text-stone-400">{hint}</span>
      </span>
    </div>
  )
}

export function ThemeEditor() {
  const [theme, setTheme] = useState<ThemePrefs>(() => loadTheme())
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const roomFileRef = useRef<HTMLInputElement>(null)

  // 変更は即座に適用＆保存（プレビューしながら調整できる）
  const update = (patch: Partial<ThemePrefs>) => {
    const next = { ...theme, ...patch }
    setTheme(next)
    saveTheme(next)
  }

  const pickTexture = async (file: File) => {
    setError(null)
    try {
      const { dataUrl } = await compressImageToDataUrl(file, TEXTURE_MAX_DIM, TEXTURE_MAX_BYTES)
      update({ texture: dataUrl })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const pickRoomBg = async (file: File) => {
    setError(null)
    try {
      // アップロード画像も「ミラータイル」(元＋左右反転を横連結)にして、
      // repeat-x で端から反転しながらブラウザ幅いっぱいに敷けるようにする。
      const dataUrl = await mirrorTileDataUrl(file)
      update({ roomBg: dataUrl })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  // 既定サンプル（未設定時）と、選択中サンプルの判定
  const roomSelected = (id: string) =>
    theme.roomBg === `sample:${id}` || (!theme.roomBg && id === ROOM_SAMPLES[0].id)

  return (
    <div className="nb-panel mt-4 grid gap-4 p-5 text-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-stone-500">見た目（テーマ）</p>
        <button
          type="button"
          onClick={() => setTheme(resetTheme())}
          className="text-xs text-stone-500 underline"
        >
          既定に戻す
        </button>
      </div>
      <p className="-mt-2 text-xs text-stone-400">
        変更はすぐ反映され、この端末に保存されます（他の端末には引き継がれません）。
      </p>

      {/* アクセントのプリセット */}
      <div>
        <p className="mb-1 text-xs text-stone-600">アクセント（プリセット）</p>
        <div className="flex flex-wrap gap-2">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.name}
              onClick={() => update({ accent: preset.accent })}
              className={`h-7 w-7 rounded-full border-2 ${
                theme.accent === preset.accent ? 'border-stone-800' : 'border-stone-200'
              }`}
              style={{ backgroundColor: preset.accent }}
            />
          ))}
        </div>
      </div>

      {/* 要素ごとの色（色の四角をクリックしてピッカーを開く） */}
      <div className="grid gap-2">
        <p className="text-xs text-stone-600">要素ごとの色（色の四角を押して選ぶ）</p>
        {THEME_COLOR_FIELDS.map((field) => (
          <ColorField
            key={field.key}
            label={field.label}
            hint={field.hint}
            value={theme[field.key] as string}
            onChange={(v) => update({ [field.key]: v } as Partial<ThemePrefs>)}
          />
        ))}
      </div>

      {/* 壁紙（地の色＋テクスチャ） */}
      <div className="grid gap-2">
        <p className="text-xs text-stone-600">壁紙</p>
        <ColorField
          label="壁紙の色"
          hint="地の色"
          value={theme.cream}
          onChange={(v) => update({ cream: v })}
        />

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void pickTexture(file)
          }}
        />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs"
          >
            テクスチャ画像をアップロード
          </button>
          <button
            type="button"
            onClick={() => update({ texture: undefined })}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs"
          >
            既定の和紙に戻す
          </button>
          <button
            type="button"
            onClick={() => update({ texture: 'none' })}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs"
          >
            無地にする
          </button>
        </div>
        <p className="text-xs text-stone-400">
          現在:{' '}
          {theme.texture === 'none'
            ? '無地'
            : theme.texture?.startsWith('data:')
              ? 'アップロード画像'
              : '既定の和紙'}
        </p>

        <label className="flex items-center gap-2 text-xs text-stone-600">
          <span className="w-24 shrink-0">テクスチャの大きさ</span>
          <input
            type="range"
            min={120}
            max={1200}
            step={20}
            value={theme.textureSize}
            onChange={(e) => update({ textureSize: Number(e.target.value) })}
            className="flex-1"
          />
          <span className="w-12 text-right text-stone-400">{theme.textureSize}px</span>
        </label>
      </div>

      {/* 自分の部屋のトップ背景（高さ120pxの帯） */}
      <div className="grid gap-2">
        <p className="text-xs text-stone-600">自分の部屋のトップ背景</p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {ROOM_SAMPLES.map((sample) => (
            <button
              key={sample.id}
              type="button"
              title={sample.label}
              onClick={() => update({ roomBg: `sample:${sample.id}` })}
              className={`overflow-hidden rounded-lg border ${
                roomSelected(sample.id)
                  ? 'border-2 border-[var(--nb-navy)]'
                  : 'border-stone-200 hover:border-stone-400'
              }`}
            >
              <img src={`/img/room/${sample.id}.webp`} alt={sample.label} className="h-8 w-full object-cover" />
              <span className="block truncate py-0.5 text-[10px] text-stone-500">{sample.label}</span>
            </button>
          ))}
        </div>
        <input
          ref={roomFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void pickRoomBg(file)
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => roomFileRef.current?.click()}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs"
          >
            自分の画像を使う
          </button>
          <button
            type="button"
            onClick={() => update({ roomBg: 'none' })}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs"
          >
            背景なし
          </button>
          <button
            type="button"
            onClick={() => update({ roomBg: undefined })}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs"
          >
            既定に戻す
          </button>
        </div>
        <p className="text-xs text-stone-400">
          現在:{' '}
          {theme.roomBg === 'none'
            ? '背景なし'
            : theme.roomBg?.startsWith('data:')
              ? 'アップロード画像'
              : theme.roomBg?.startsWith('sample:')
                ? (ROOM_SAMPLES.find((s) => `sample:${s.id}` === theme.roomBg)?.label ?? 'サンプル')
                : '既定'}
        </p>
      </div>

      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
