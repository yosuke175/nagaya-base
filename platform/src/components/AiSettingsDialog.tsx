import { useEffect, useState } from 'react'
import {
  DEFAULT_AI_MODEL,
  fetchAiStatus,
  getAiSettings,
  persistAiSettings,
  removeAiSettings,
  type AiSettingsScope,
} from '../host/aiSettings'

/**
 * Platform-wide AI settings (one key per user, used by gadget.ai).
 * Account scope: the key is stored encrypted server-side and used only by
 * /api/ai — it is never displayed nor returned to the browser. Device scope
 * (no-login local dev) keeps the old localStorage behavior.
 */
export function AiSettingsDialog({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(DEFAULT_AI_MODEL)
  const [scope, setScope] = useState<AiSettingsScope>('device')
  const [registered, setRegistered] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState<AiSettingsScope | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const status = await fetchAiStatus()
      if (cancelled) return
      setScope(status.scope)
      setRegistered(status.registered)
      setModel(status.model)
      if (status.scope === 'device') {
        // Device fallback only — on the account scope the key never comes back
        setApiKey(getAiSettings().apiKey ?? '')
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const save = async () => {
    const trimmed = apiKey.trim()
    if (!trimmed && !(scope === 'account' && registered)) return
    setError(null)
    try {
      const storedScope = await persistAiSettings({
        apiKey: trimmed || null,
        model: model.trim() || DEFAULT_AI_MODEL,
      })
      setSaved(storedScope)
      setRegistered(true)
      setApiKey('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const remove = async () => {
    setError(null)
    try {
      await removeAiSettings()
      setApiKey('')
      setModel(DEFAULT_AI_MODEL)
      setRegistered(false)
      setSaved(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
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
        {loading ? (
          <p className="mt-3 text-stone-400">読み込み中…</p>
        ) : (
          <>
            <p className="mt-2 text-stone-500">
              現在の状態:{' '}
              {registered ? (
                <span className="text-green-700">APIキー登録済み</span>
              ) : (
                'APIキー未登録'
              )}
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
                  setSaved(null)
                }}
                placeholder={
                  scope === 'account' && registered
                    ? '登録済み（変更する場合のみ入力）'
                    : 'sk-ant-...'
                }
                className="rounded-lg border border-stone-300 p-2 font-mono"
              />
            </label>
            <label className="mt-2 grid gap-1">
              <span className="text-stone-600">モデル（既定: {DEFAULT_AI_MODEL}）</span>
              <input
                value={model}
                onChange={(changeEvent) => {
                  setModel(changeEvent.target.value)
                  setSaved(null)
                }}
                className="rounded-lg border border-stone-300 p-2 font-mono"
              />
            </label>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void save()}
                className="btn-primary rounded-lg px-3 py-1.5 font-medium"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => void remove()}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-red-700 hover:bg-red-50"
              >
                削除
              </button>
              {saved && (
                <span className="text-green-700">
                  {saved === 'account'
                    ? '保存しました（アカウント・全端末で共有）'
                    : '保存しました（この端末のみ）'}
                </span>
              )}
            </div>
            {error && <p className="mt-2 text-red-700">{error}</p>}
            <p className="mt-2 text-stone-400">
              {scope === 'account'
                ? '保存先: あなたのアカウント（サーバー側で暗号化保管。AI呼び出しもサーバー側で代理実行され、キーがブラウザに返ることはありません）'
                : '保存先: この端末のみ（ログイン + サーバー設定が揃うとアカウント保存に切り替わります。docs/backlog.md 参照）'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
