import { useState } from 'react'
import { THEME_PRESETS, loadAccent, saveAccent } from '../theme'

/** Accent-color picker: presets plus a free color input. */
export function ThemePicker() {
  const [open, setOpen] = useState(false)
  const [accent, setAccent] = useState(() => loadAccent())

  const select = (value: string) => {
    setAccent(value)
    saveAccent(value)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="テーマ設定"
        title="テーマ設定"
        className="rounded-lg border border-stone-200 px-2 py-1.5 text-sm hover:bg-stone-50"
      >
        🎨
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-stone-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs font-semibold text-stone-600">アクセントカラー</p>
          <div className="flex flex-wrap gap-2">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.name}
                onClick={() => select(preset.accent)}
                className={`h-7 w-7 rounded-full border-2 ${
                  accent === preset.accent ? 'border-stone-800' : 'border-stone-200'
                }`}
                style={{ backgroundColor: preset.accent }}
              />
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-stone-600">
            好きな色を選ぶ
            <input
              type="color"
              value={accent}
              onChange={(changeEvent) => select(changeEvent.target.value)}
              className="h-7 w-10 cursor-pointer rounded border border-stone-200 bg-transparent p-0"
            />
          </label>
        </div>
      )}
    </div>
  )
}
