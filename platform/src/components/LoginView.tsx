import { useState, type FormEvent } from 'react'
import { IMG } from '../assets'
import { appConfig } from '../config'
import type { Auth } from '../auth/useAuth'

// 入場画面（2026-07-04 決定のロール/入場モデル）:
//  ゲスト（軒先）= 匿名で即入場・閲覧のみ / 一般ユーザー（店子）= メール登録で user。
//  ロールはサインアップ時のトリガーがサーバー側で付与する（クライアントは書かない）。

type Mode = 'choose' | 'user'
type AuthMode = 'login' | 'register' | 'magiclink'

export function LoginView({ auth }: { auth: Auth }) {
  const [mode, setMode] = useState<Mode>('choose')

  return (
    <div
      className="mx-auto mt-10 max-w-md overflow-hidden rounded-2xl border border-stone-200 shadow-sm"
      style={{ backgroundColor: 'var(--nb-cream)' }}
    >
      <div
        className="bg-cover bg-center p-6 text-white"
        style={{ backgroundImage: `linear-gradient(rgb(30 44 74 / 0.55), rgb(30 44 74 / 0.55)), url(${IMG.keyvisual.gateStreet})` }}
      >
        <h2 className="text-lg font-bold">{appConfig.appName} へようこそ</h2>
        <p className="mt-1 text-xs opacity-90">職人の道具を選んで、自分の棚に並べる長屋です</p>
      </div>

      <div className="p-6">
        {mode === 'choose' ? (
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => void auth.signInAsGuest()}
              className="rounded-xl border border-stone-300 px-4 py-3 text-left hover:bg-white/60"
            >
              <span className="text-sm font-bold" style={{ color: 'var(--nb-navy)' }}>
                軒先で、まず見て回る（ゲスト）
              </span>
              <span className="mt-0.5 block text-xs text-stone-500">
                登録なしですぐ入れます。道具市の閲覧のみ（インストール・保存はできません）
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode('user')}
              className="btn-primary rounded-xl px-4 py-3 text-left"
            >
              <span className="text-sm font-bold">入居する（一般ユーザー登録・ログイン）</span>
              <span className="mt-0.5 block text-xs opacity-90">
                メール登録で、道具のインストールや自分のデータ保存ができます
              </span>
            </button>
          </div>
        ) : (
          <UserAuthForm auth={auth} onBack={() => setMode('choose')} />
        )}
      </div>
    </div>
  )
}

function UserAuthForm({ auth, onBack }: { auth: Auth; onBack: () => void }) {
  // パスワードを主（デフォルト）に。メールのリンクは副の選択肢。
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const switchMode = (next: AuthMode) => {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  const run = async (submitEvent: FormEvent, action: () => Promise<{ error: string | null }>) => {
    submitEvent.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    const result = await action()
    setBusy(false)
    if (result.error) setError(result.error)
    else if (mode === 'magiclink')
      setNotice(`${email} 宛にログイン用リンクを送信しました。メールを開いてください。`)
    else if (mode === 'register')
      setNotice(`${email} 宛に確認メールを送信しました。リンクをクリックすると登録が完了します。`)
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-3 text-xs text-stone-500 underline">
        ← 戻る
      </button>

      {mode !== 'magiclink' && (
        <div className="mb-4 flex gap-1 text-xs">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 rounded-lg px-3 py-1.5 font-medium ${mode === 'login' ? 'btn-primary' : 'border border-stone-300'}`}
          >
            ログイン
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex-1 rounded-lg px-3 py-1.5 font-medium ${mode === 'register' ? 'btn-primary' : 'border border-stone-300'}`}
          >
            新規登録
          </button>
        </div>
      )}

      {mode === 'magiclink' ? (
        <form onSubmit={(e) => run(e, () => auth.signInWithMagicLink(email.trim()))} className="grid gap-3">
          <p className="text-xs font-semibold text-stone-600">メールのリンクで入る（パスワード不要）</p>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレス"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? '送信中…' : 'ログインリンクを送る'}
          </button>
          <button
            type="button"
            onClick={() => switchMode('login')}
            className="text-xs text-stone-500 underline"
          >
            ← パスワードで入る
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) =>
            run(e, () =>
              mode === 'register'
                ? auth.signUpWithPassword(email.trim(), password)
                : auth.signInWithPassword(email.trim(), password),
            )
          }
          className="grid gap-3"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレス"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード（8文字以上）"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? '処理中…' : mode === 'register' ? '新規登録する' : 'ログイン'}
          </button>
          <button
            type="button"
            onClick={() => switchMode('magiclink')}
            className="text-xs text-stone-400 underline"
          >
            パスワードを使わず、メールのリンクで入る
          </button>
        </form>
      )}

      {error && <p className="mt-3 text-xs text-red-700">エラー: {error}</p>}
      {notice && <p className="mt-3 text-xs text-green-700">{notice}</p>}
    </div>
  )
}
