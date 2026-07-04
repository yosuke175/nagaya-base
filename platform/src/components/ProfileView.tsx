import { useEffect, useRef, useState } from 'react'
import { compressImageToDataUrl } from '../lib/imageCompress'
import { loadMyProfile, residentsAvailable, saveMyProfile } from '../host/residents'

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

export function ProfileView() {
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
