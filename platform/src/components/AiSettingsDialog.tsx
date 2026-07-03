import { useState } from 'react'
import {
  DEFAULT_AI_MODEL,
  clearAiSettings,
  getAiSettings,
  saveAiSettings,
} from '../host/aiSettings'

/**
 * Platform-wide AI settings (one key per user, used by gadget.ai).
 * The key never leaves the platform side — gadgets only receive generated
 * text (ADR-001). Storage is the ADR-005 mock for now.
 */
export function AiSettingsDialog({ onClose }: { onClose: () => void }) {
  const initial = getAiSettings()
  const [apiKey, setApiKey] = useState(initial.apiKey ?? '')
  const [model, setModel] = useState(initial.model)
  const [saved, setSaved] = useState(false)

  const save = () => {
    const trimmed = apiKey.trim()
    if (!trimmed) return
    saveAiSettings({ apiKey: trimmed, model: model.trim() || DEFAULT_AI_MODEL })
    setSaved(true)
  }

  const remove = () => {
    clearAiSettings()
    setApiKey('')
    setModel(DEFAULT_AI_MODEL)
    setSaved(false)
  }

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center bg-stone-900/30 p-4 pt-20">
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-4 text-xs shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold">AI設定</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-stone-200 px-2 py-0.5 text-stone-500 hover:bg-stone-50"
          >
            閉じる
          </button>
        </div>
        <p className="mt-2 leading-relaxed text-stone-600">
          ここに登録した API キーで、「ai」権限を承認したガジェットが AI（文章生成）を
          利用できます。キーはガジェットには渡されず、利用量はあなたのキーに課金されます。
        </p>
        <label className="mt-3 grid gap-1">
          <span className="text-stone-600">
            Anthropic API キー（console.anthropic.com で取得）
          </span>
          <input
            type="password"
            value={apiKey}
            onChange={(changeEvent) => {
              setApiKey(changeEvent.target.value)
              setSaved(false)
            }}
            placeholder="sk-ant-..."
            className="rounded-lg border border-stone-300 p-2 font-mono"
          />
        </label>
        <label className="mt-2 grid gap-1">
          <span className="text-stone-600">モデル（既定: {DEFAULT_AI_MODEL}）</span>
          <input
            value={model}
            onChange={(changeEvent) => {
              setModel(changeEvent.target.value)
              setSaved(false)
            }}
            className="rounded-lg border border-stone-300 p-2 font-mono"
          />
        </label>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            className="btn-primary rounded-lg px-3 py-1.5 font-medium"
          >
            保存
          </button>
          <button
            type="button"
            onClick={remove}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-red-700 hover:bg-red-50"
          >
            削除
          </button>
          {saved && <span className="text-green-700">保存しました</span>}
        </div>
        <p className="mt-2 text-stone-400">
          保存先は現在この端末のみ（暗号化なしのモック）。Workers 側での暗号化保管・AI
          ゲートウェイへの移行は docs/backlog.md 参照。
        </p>
      </div>
    </div>
  )
}
