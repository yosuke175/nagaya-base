import { useEffect, useState } from 'react'
import {
  AI_MODELS,
  AI_PROVIDERS,
  DEFAULT_AI_MODEL,
  fetchAiStatus,
  persistAiSettings,
  removeAiSettings,
  type AiProvider,
  type AiSettingsScope,
} from '../host/aiSettings'
import { JPY_PER_USD, myMonthlyCostUsd } from '../host/aiUsage'

/**
 * プラットフォーム共通の AI設定フォーム（ユーザー1人につき1キー、gadget.ai が使う）。
 * キーはガジェット iframe に渡らない（ADR-001）。account スコープでは暗号化して
 * サーバー保管され、AI呼び出しもサーバー側で代理実行される（キーはブラウザに返らない）。
 *
 * 保存済みのキーは画面に出さない（●● 表示）。工房にインライン表示するほか、
 * モーダル（AiSettingsDialog）からも使う。
 */
export function AiSettingsPanel({ onOpenHelp }: { onOpenHelp: () => void }) {
  const [provider, setProvider] = useState<AiProvider>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(DEFAULT_AI_MODEL.anthropic)
  const [scope, setScope] = useState<AiSettingsScope>('device')
  const [registered, setRegistered] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState<AiSettingsScope | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [monthUsd, setMonthUsd] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const status = await fetchAiStatus()
        if (cancelled) return
        setScope(status.scope)
        setRegistered(status.registered)
        setProvider(status.provider)
        setModel(status.model)
        // 保存済みキーは読み込まない（●● 表示のまま。変更時のみ入力させる）
      } catch (cause) {
        // 確認自体が失敗した場合は「未登録」と誤表示せず、エラーとして出す
        // （以前はここで握りつぶして未登録扱いにしていたため、実際は保存できているのに
        // 「保存されていないように見える」という紛らわしい表示になっていた）
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    void myMonthlyCostUsd().then((usd) => {
      if (!cancelled) setMonthUsd(usd)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // プロバイダを変えたら、選択中モデルが新プロバイダに無ければ既定モデルに切り替える
  const changeProvider = (next: AiProvider) => {
    setProvider(next)
    setSaved(null)
    if (!AI_MODELS[next].some((m) => m.id === model)) setModel(DEFAULT_AI_MODEL[next])
  }

  const save = async () => {
    const trimmed = apiKey.trim()
    if (!trimmed && !registered) return
    setError(null)
    try {
      const storedScope = await persistAiSettings({
        provider,
        apiKey: trimmed || null,
        model: model.trim() || DEFAULT_AI_MODEL[provider],
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
      setRegistered(false)
      setSaved(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="text-xs">
      <p className="leading-relaxed text-stone-600">
        AIを使う道具は、<strong>あなた自身のAIのAPIキー</strong>で動きます（使った分だけ、
        あなたのAI契約に課金）。Claude / OpenAI / Google など、お好みの提供元を選べます。
        <button type="button" onClick={onOpenHelp} className="ml-1 underline" style={{ color: 'var(--nb-terra)' }}>
          キーの取り方・使い方（案内所）
        </button>
      </p>
      {loading ? (
        <p className="mt-3 text-stone-400">読み込み中…</p>
      ) : (
        <>
          <p className="mt-2 text-stone-500">
            現在: {registered ? <span className="text-green-700">登録済み（●●●●）</span> : '未登録'}
          </p>
          {monthUsd != null && monthUsd > 0 && (
            <p className="mt-1 text-stone-400">
              今月のAI利用（概算）: 約 ${monthUsd.toFixed(3)}（≈ ¥
              {Math.round(monthUsd * JPY_PER_USD).toLocaleString('ja-JP')}）
              <span className="ml-1">※文字数からの粗い見積り。正確な額は各社の請求で</span>
            </p>
          )}
          <label className="mt-3 grid gap-1">
            <span className="text-stone-600">AIの提供元</span>
            <select
              value={provider}
              onChange={(e) => changeProvider(e.target.value as AiProvider)}
              className="rounded-lg border border-stone-300 p-2"
            >
              {AI_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2 grid gap-1">
            <span className="text-stone-600">API キー</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value)
                setSaved(null)
              }}
              placeholder={registered ? '●●●●●●●●（登録済み・変更する場合のみ入力）' : 'sk-... / AIza...'}
              className="rounded-lg border border-stone-300 p-2 font-mono"
            />
          </label>
          <label className="mt-2 grid gap-1">
            <span className="text-stone-600">モデル</span>
            <select
              value={model}
              onChange={(e) => {
                setModel(e.target.value)
                setSaved(null)
              }}
              className="rounded-lg border border-stone-300 p-2"
            >
              {/* 保存済みモデルが一覧に無い場合も失わないよう先頭に出す */}
              {!AI_MODELS[provider].some((m) => m.id === model) && model && (
                <option value={model}>{model}（現在の設定）</option>
              )}
              {AI_MODELS[provider].map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="text-stone-400">
              「速い・安い」＝素早い応答／「高性能・深い思考」＝じっくり考える用。
              道具が処理に応じて自動で切り替えることもあり、ここは指定が無いときの既定です。
            </span>
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
                {saved === 'account' ? '保存しました（全端末で共有）' : '保存しました（この端末のみ）'}
              </span>
            )}
          </div>
          {error && <p className="mt-2 text-red-700">{error}</p>}
          <p className="mt-2 text-stone-400">
            {scope === 'account'
              ? '保存先: あなたのアカウント（サーバー側で暗号化保管。AI呼び出しもサーバー側で代理実行され、キーがブラウザに返ることはありません）'
              : '保存先: この端末のみ（ログイン + サーバー設定が揃うとアカウント保存に切り替わります）'}
          </p>
        </>
      )}
    </div>
  )
}

/** AI設定をモーダルで開くラッパー（インライン表示できない場面用に残置） */
export function AiSettingsDialog({ onClose, onOpenHelp }: { onClose: () => void; onOpenHelp: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center bg-stone-900/30 p-4 pt-20">
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold">AI設定</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-stone-200 px-2 py-0.5 text-xs text-stone-500 hover:bg-stone-50"
          >
            閉じる
          </button>
        </div>
        <div className="mt-2">
          <AiSettingsPanel onOpenHelp={onOpenHelp} />
        </div>
      </div>
    </div>
  )
}
