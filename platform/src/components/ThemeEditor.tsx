import { useRef, useState } from 'react'
import { compressImageToDataUrl } from '../lib/imageCompress'
import {
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

export function ThemeEditor() {
  const [theme, setTheme] = useState<ThemePrefs>(() => loadTheme())
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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

      {/* 要素ごとの色 */}
      <div className="grid gap-2">
        <p className="text-xs text-stone-600">要素ごとの色</p>
        {THEME_COLOR_FIELDS.map((field) => (
          <label key={field.key} className="flex items-center gap-3">
            <input
              type="color"
              value={theme[field.key] as string}
              onChange={(e) => update({ [field.key]: e.target.value } as Partial<ThemePrefs>)}
              className="h-7 w-10 shrink-0 cursor-pointer rounded border border-stone-200 bg-transparent p-0"
            />
            <span className="text-xs">
              <span className="font-medium">{field.label}</span>
              <span className="ml-2 text-stone-400">{field.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {/* 壁紙（地の色＋テクスチャ） */}
      <div className="grid gap-2">
        <p className="text-xs text-stone-600">壁紙</p>
        <label className="flex items-center gap-3">
          <input
            type="color"
            value={theme.cream}
            onChange={(e) => update({ cream: e.target.value })}
            className="h-7 w-10 shrink-0 cursor-pointer rounded border border-stone-200 bg-transparent p-0"
          />
          <span className="text-xs">壁紙の色（地の色）</span>
        </label>

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
        <div className="flex flex-wrap items-center gap-2">
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

      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
