import { useState, type FormEvent } from 'react'
import { appConfig } from '../config'

interface LoginViewProps {
  onSubmit: (email: string) => Promise<{ error: string | null }>
}

/** Magic-link login (FR-01). Google login is a later iteration. */
export function LoginView({ onSubmit }: LoginViewProps) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault()
    const target = email.trim()
    if (!target || state === 'sending') return
    setState('sending')
    setError(null)
    const result = await onSubmit(target)
    if (result.error) {
      setError(`送信に失敗しました: ${result.error}`)
      setState('idle')
    } else {
      setState('sent')
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold">{appConfig.appName} にログイン</h2>
      {state === 'sent' ? (
        <div className="mt-4 text-sm leading-relaxed text-stone-700">
          <p>
            <strong>{email}</strong> 宛にログイン用リンクを送信しました。
          </p>
          <p className="mt-2">
            メールを開いてリンクをクリックすると、この画面に戻ってログインが完了します
            （届くまで1〜2分かかることがあります。迷惑メールフォルダもご確認ください）。
          </p>
          <button
            type="button"
            onClick={() => setState('idle')}
            className="mt-4 text-xs text-stone-500 underline hover:text-stone-700"
          >
            別のメールアドレスでやり直す
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs text-stone-600">
            メールアドレス
            <input
              type="email"
              required
              value={email}
              onChange={(changeEvent) => setEmail(changeEvent.target.value)}
              placeholder="you@example.com"
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={state === 'sending'}
            className="rounded-lg bg-stone-800 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {state === 'sending' ? '送信中…' : 'ログインリンクを送る'}
          </button>
          <p className="text-xs text-stone-400">
            パスワードは不要です。メールに届くリンクをクリックするだけでログインできます。
            Google アカウントでのログインは後日対応予定です。
          </p>
        </form>
      )}
    </div>
  )
}
