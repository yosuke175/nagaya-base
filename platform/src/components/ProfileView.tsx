import { useEffect, useRef, useState } from 'react'
import { compressImageToDataUrl } from '../lib/imageCompress'
import { loadMyProfile, residentsAvailable, saveMyProfile, setMyPassword } from '../host/residents'
import { leaveNagaya, offboardingAvailable, type GadgetDisposition } from '../host/offboarding'
import { ThemeEditor } from './ThemeEditor'

/** 「あなたの部屋」から使える、ヘッダーから移設したアカウント操作・案内 */
export interface ProfileViewProps {
  onSignOut: () => void
  onOpenAiSettings: () => void
  onOpenHelp: () => void
  onOpenGuide: (guide: 'entrance' | 'craftsman-guide' | 'tutorial') => void
}

// 自分の入居者情報の編集（フェーズ2）。各項目に「他の入居者に見せる」トグル。
// アイコンはクライアント圧縮した小さな data-URL（Storage 不使用）。

const AVATAR_MAX_DIM = 160
const AVATAR_MAX_BYTES = 40 * 1024

interface Field {
  key: 'displayName' | 'avatar' | 'bio' | 'links'
  label: string
  defaultVisible: boolean
}
const FIELDS: Field[] = [
  { key: 'displayName', label: '名前', defaultVisible: true },
  { key: 'avatar', label: 'アイコン', defaultVisible: true },
  { key: 'bio', label: '自己紹介', defaultVisible: false },
  { key: 'links', label: 'リンク', defaultVisible: false },
]

export function ProfileView({
  onSignOut,
  onOpenAiSettings,
  onOpenHelp,
  onOpenGuide,
}: ProfileViewProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [roomNo, setRoomNo] = useState<number | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [bio, setBio] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [links, setLinks] = useState<Record<string, string>>({})
  const [visibility, setVisibility] = useState<Record<string, boolean>>({})
  const [role, setRole] = useState('user')
  const [newPassword, setNewPassword] = useState('')
  const [pwSaved, setPwSaved] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadMyProfile()
      .then((profile) => {
        setRoomNo(profile.roomNo)
        setDisplayName(profile.displayName)
        setAvatar(profile.avatar)
        setBio(profile.bio ?? '')
        setLinks(profile.links)
        setVisibility(profile.visibility)
        setRole(profile.role)
        setLoading(false)
      })
      .catch((cause: Error) => {
        setError(cause.message)
        setLoading(false)
      })
  }, [])

  if (!residentsAvailable()) {
    return <p className="p-4 text-sm text-stone-500">入居者情報はログイン環境でのみ利用できます。</p>
  }

  const isVisible = (key: Field['key']) =>
    visibility[key] ?? FIELDS.find((f) => f.key === key)!.defaultVisible

  const pickAvatar = async (file: File) => {
    setError(null)
    try {
      const { dataUrl } = await compressImageToDataUrl(file, AVATAR_MAX_DIM, AVATAR_MAX_BYTES)
      setAvatar(dataUrl)
      setSaved(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const save = async () => {
    setError(null)
    try {
      await saveMyProfile({ displayName: displayName.trim(), avatar, bio: bio.trim() || null, links, visibility })
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  if (loading) return <p className="p-4 text-sm text-stone-400">読み込み中…</p>

  return (
    <div className="mx-auto max-w-lg">
      <h2 className="mb-1 text-lg font-bold" style={{ color: 'var(--nb-navy)' }}>
        入居者情報（あなたの部屋）
      </h2>
      <p className="mb-3 text-xs text-stone-500">
        {roomNo ? `部屋番号 ${roomNo} 号室` : '部屋番号は入居（一般ユーザー登録）で付きます'}
        ・ 各項目の「見せる」で他の入居者への公開/非公開を選べます
      </p>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className="nb-panel grid gap-4 p-5 text-sm">
        <div className="flex items-center gap-4">
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-stone-300 bg-white text-2xl text-stone-400"
          >
            {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : '🙂'}
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void pickAvatar(file)
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs"
            >
              アイコンを選ぶ
            </button>
            {avatar && (
              <button
                type="button"
                onClick={() => {
                  setAvatar(null)
                  setSaved(false)
                }}
                className="ml-2 text-xs text-red-600 underline"
              >
                外す
              </button>
            )}
            <VisibilityToggle
              label="アイコンを見せる"
              on={isVisible('avatar')}
              onChange={(v) => setVisibility({ ...visibility, avatar: v })}
            />
          </div>
        </div>

        <label className="grid gap-1">
          <span className="text-xs text-stone-600">名前</span>
          <input
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value)
              setSaved(false)
            }}
            className="rounded-lg border border-stone-300 px-3 py-2"
          />
          <VisibilityToggle
            label="名前を見せる"
            on={isVisible('displayName')}
            onChange={(v) => setVisibility({ ...visibility, displayName: v })}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-stone-600">自己紹介</span>
          <textarea
            value={bio}
            onChange={(e) => {
              setBio(e.target.value)
              setSaved(false)
            }}
            rows={3}
            maxLength={500}
            placeholder="得意なこと、つくりたい道具、興味など"
            className="rounded-lg border border-stone-300 px-3 py-2"
          />
          <VisibilityToggle
            label="自己紹介を見せる"
            on={isVisible('bio')}
            onChange={(v) => setVisibility({ ...visibility, bio: v })}
          />
        </label>

        <div className="grid gap-1">
          <span className="text-xs text-stone-600">リンク（SNS・ブログなど）</span>
          {Object.entries(links).map(([label, url]) => (
            <div key={label} className="flex items-center gap-2 text-xs">
              <span className="font-medium">{label}</span>
              <span className="flex-1 truncate text-stone-500">{url}</span>
              <button
                type="button"
                onClick={() => {
                  const next = { ...links }
                  delete next[label]
                  setLinks(next)
                  setSaved(false)
                }}
                className="text-red-600 underline"
              >
                削除
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              placeholder="ラベル（例: X）"
              className="w-24 rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
            />
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
              className="flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={() => {
                if (linkLabel.trim() && /^https?:\/\//.test(linkUrl.trim())) {
                  setLinks({ ...links, [linkLabel.trim()]: linkUrl.trim() })
                  setLinkLabel('')
                  setLinkUrl('')
                  setSaved(false)
                }
              }}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs"
            >
              追加
            </button>
          </div>
          <VisibilityToggle
            label="リンクを見せる"
            on={isVisible('links')}
            onChange={(v) => setVisibility({ ...visibility, links: v })}
          />
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void save()} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
            保存
          </button>
          {saved && <span className="text-xs text-green-700">保存しました</span>}
        </div>
      </div>

      {role !== 'guest' && (
        <div className="nb-panel mt-4 grid gap-2 p-5 text-sm">
          <p className="text-xs font-semibold text-stone-500">ログイン用パスワード</p>
          <p className="text-xs text-stone-500">
            パスワードを設定すると、次回から「メール＋パスワード」でもログインできます
            （マジックリンクも引き続き使えます）。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value)
                setPwSaved(false)
                setPwError(null)
              }}
              placeholder="新しいパスワード（8文字以上）"
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2"
            />
            <button
              type="button"
              onClick={async () => {
                if (newPassword.length < 8) {
                  setPwError('パスワードは8文字以上にしてください')
                  return
                }
                setPwError(null)
                try {
                  await setMyPassword(newPassword)
                  setPwSaved(true)
                  setNewPassword('')
                } catch (cause) {
                  setPwError(cause instanceof Error ? cause.message : String(cause))
                }
              }}
              className="btn-primary rounded-lg px-4 py-2 text-sm font-medium"
            >
              パスワードを設定する
            </button>
          </div>
          {pwSaved && <span className="text-xs text-green-700">パスワードを設定しました</span>}
          {pwError && <span className="text-xs text-red-700">{pwError}</span>}
        </div>
      )}

      <AccountActions
        onSignOut={onSignOut}
        onOpenAiSettings={onOpenAiSettings}
        onOpenHelp={onOpenHelp}
        onOpenGuide={onOpenGuide}
      />

      <ThemeEditor />

      <LeaveSection />
    </div>
  )
}

/** ヘッダーから移設した操作（AI設定・案内・はじめ方・ログアウト） */
function AccountActions({
  onSignOut,
  onOpenAiSettings,
  onOpenHelp,
  onOpenGuide,
}: ProfileViewProps) {
  return (
    <div className="nb-panel mt-4 grid gap-3 p-5 text-sm">
      <p className="text-xs font-semibold text-stone-500">アカウント・案内</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpenAiSettings}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-50"
        >
          AI設定
        </button>
        <button
          type="button"
          onClick={onOpenHelp}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-50"
        >
          案内所を開く
        </button>
        <button
          type="button"
          onClick={() => onOpenGuide('entrance')}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-50"
        >
          入口をやり直す（職人/店子）
        </button>
        <button
          type="button"
          onClick={() => onOpenGuide('craftsman-guide')}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-50"
        >
          職人のはじめ方
        </button>
        <button
          type="button"
          onClick={() => onOpenGuide('tutorial')}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-50"
        >
          店子のはじめ方
        </button>
      </div>
      <div>
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
        >
          ログアウト
        </button>
      </div>
    </div>
  )
}

/**
 * 退去（アカウント削除）。個人データは必ず消え、作った道具の扱いだけ本人が選ぶ。
 * 著作権の話はUIに出さない（ADR-006: 著作権は作者に残る／CLA許諾は撤回不可）。
 * 二段階（開く → 選ぶ → 理解チェック → 実行）で誤操作を防ぐ。
 */
function LeaveSection() {
  const [available, setAvailable] = useState(false)
  const [open, setOpen] = useState(false)
  const [disposition, setDisposition] = useState<GadgetDisposition>('keep')
  const [understood, setUnderstood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void offboardingAvailable().then(setAvailable)
  }, [])

  if (!available) return null

  const leave = async () => {
    setBusy(true)
    setError(null)
    try {
      await leaveNagaya(disposition)
      // 成功するとサインアウト → App が LoginView に切り替わる（このビューは外れる）
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBusy(false)
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-red-200 bg-red-50/50 p-5 text-sm">
      <h3 className="text-sm font-bold text-red-800">長屋を出る（退去）</h3>
      <p className="mt-1 text-xs leading-relaxed text-stone-600">
        退去すると、あなたの個人データ（プロフィール・設定・道具の保存データ・連携キー）が
        すべて削除され、元に戻せません。
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-100"
        >
          退去の手続きへ
        </button>
      ) : (
        <div className="mt-3 grid gap-3">
          <fieldset className="grid gap-2">
            <legend className="text-xs font-semibold text-stone-700">
              あなたが作った道具の扱い
            </legend>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="disposition"
                checked={disposition === 'keep'}
                onChange={() => setDisposition('keep')}
                className="mt-0.5"
              />
              <span className="text-xs">
                <span className="font-medium">長屋に残す（おすすめ）</span>
                <br />
                <span className="text-stone-500">
                  道具はそのまま道具市に残り、今後の世話は大家に引き継がれます。
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="disposition"
                checked={disposition === 'suspend'}
                onChange={() => setDisposition('suspend')}
                className="mt-0.5"
              />
              <span className="text-xs">
                <span className="font-medium">自分の道具も道具市から下げる</span>
                <br />
                <span className="text-stone-500">
                  あなたの道具を道具市から取り下げます（コード自体はリポジトリに残ります）。
                </span>
              </span>
            </label>
          </fieldset>

          <label className="flex items-start gap-2 text-xs text-stone-700">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-0.5"
            />
            個人データが削除され、元に戻せないことを理解しました。
          </label>

          {error && <p className="rounded-lg bg-red-100 px-3 py-2 text-xs text-red-700">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!understood || busy}
              onClick={() => void leave()}
              className="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? '退去処理中…' : '退去する'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setUnderstood(false)
                setError(null)
              }}
              className="rounded-lg border border-stone-300 px-3 py-2 text-xs"
            >
              やめる
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function VisibilityToggle({
  label,
  on,
  onChange,
}: {
  label: string
  on: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
