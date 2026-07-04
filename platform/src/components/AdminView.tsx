import { useEffect, useState } from 'react'
import { getAccessToken } from '../host/credentialsApi'
import { JPY_PER_USD } from '../host/aiUsage'

// 大家の間（フェーズ3）: admin だけに表示。入居者のロールを付与する。
// 実際の変更は /api/admin（service_role）で行い、audit_logs に記録される。

interface AdminUser {
  id: string
  displayName: string
  role: string
  roomNo: number | null
  email: string | null
}

interface AdminGadget {
  id: string
  name: string | null
  status: string
  owner_id: string | null
}

const GADGET_STATUS_LABEL: Record<string, string> = {
  draft: '構築中',
  in_review: '審査中',
  published: '公開中',
  suspended: '停止中',
}

const ROLE_OPTIONS = ['guest', 'user', 'admin'] as const
const ROLE_LABEL: Record<string, string> = {
  guest: '軒先（guest）',
  user: '入居者（user）',
  developer: '職人（developer・旧）',
  admin: '大家（admin）',
}

async function adminApi<T>(body: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken()
  if (!token) throw new Error('ログインが必要です')
  const response = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const payload = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(payload.error ?? `管理API エラー (HTTP ${response.status})`)
  return payload
}

export function AdminView() {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [gadgets, setGadgets] = useState<AdminGadget[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<AdminUser | null>(null)

  const reload = () => {
    adminApi<{ users: AdminUser[] }>({ action: 'list' })
      .then((data) => setUsers(data.users))
      .catch((cause: Error) => setError(cause.message))
    adminApi<{ gadgets: AdminGadget[] }>({ action: 'list-gadgets' })
      .then((data) => setGadgets(data.gadgets))
      .catch((cause: Error) => setError(cause.message))
  }
  useEffect(reload, [])

  const setRole = async (user: AdminUser, role: string) => {
    setError(null)
    setNotice(null)
    try {
      await adminApi({ action: 'set-role', targetUserId: user.id, role })
      setNotice(`${user.displayName} を ${ROLE_LABEL[role]} にしました`)
      reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const setRoomNo = async (user: AdminUser, roomNo: number | null) => {
    setError(null)
    setNotice(null)
    try {
      await adminApi({ action: 'set-room-no', targetUserId: user.id, roomNo })
      setNotice(
        `${user.displayName} を ${roomNo != null ? `${roomNo}号室` : '（号室なし）'} にしました`,
      )
      reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const deleteUser = async (user: AdminUser) => {
    setError(null)
    setNotice(null)
    try {
      await adminApi({ action: 'delete-user', targetUserId: user.id })
      setNotice(`「${user.displayName}」のアカウントを削除しました`)
      setDeleting(null)
      reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const setGadgetStatus = async (gadget: AdminGadget, status: 'suspended' | 'published') => {
    setError(null)
    setNotice(null)
    try {
      await adminApi({ action: 'set-gadget-status', gadgetId: gadget.id, status })
      setNotice(
        `「${gadget.name ?? gadget.id}」を${status === 'suspended' ? '停止' : '再開'}しました`,
      )
      reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-1 text-lg font-bold" style={{ color: 'var(--nb-navy)' }}>
        大家の間（管理者）
      </h2>
      <p className="mb-3 text-xs text-stone-500">
        入居者のロールを付与します。変更は記録（監査ログ）に残ります。自分自身のロールはここでは変えられません。
      </p>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {notice && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">{notice}</p>}

      <AiUsageSummary />

      <h3 className="mb-2 mt-2 text-sm font-bold" style={{ color: 'var(--nb-navy)' }}>
        入居者
      </h3>
      {users === null && !error && <p className="text-sm text-stone-400">読み込み中…</p>}

      <div className="grid gap-2">
        {users?.map((user) => (
          <div key={user.id} className="nb-panel flex items-center gap-3 p-3 text-sm">
            {user.role === 'guest' ? (
              <span className="w-24 shrink-0 text-xs text-stone-400">軒先（ゲスト）</span>
            ) : (
              <RoomNoEditor user={user} onSave={(n) => void setRoomNo(user, n)} />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" style={{ color: 'var(--nb-navy)' }}>
                {user.displayName}
              </p>
              <p className="truncate text-xs text-stone-500">{user.email ?? '（メールなし・ゲスト）'}</p>
            </div>
            <select
              value={ROLE_OPTIONS.includes(user.role as (typeof ROLE_OPTIONS)[number]) ? user.role : 'user'}
              onChange={(e) => void setRole(user, e.target.value)}
              className="rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setDeleting(user)}
              className="shrink-0 rounded-lg border border-red-300 px-2 py-1.5 text-xs text-red-700 hover:bg-red-50"
              title="このアカウントを削除する"
            >
              削除
            </button>
          </div>
        ))}
      </div>

      {deleting && (
        <DeleteUserDialog
          user={deleting}
          onConfirm={() => void deleteUser(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}

      <h3 className="mb-1 mt-8 text-sm font-bold" style={{ color: 'var(--nb-navy)' }}>
        道具の緊急停止（FR-09）
      </h3>
      <p className="mb-3 text-xs text-stone-500">
        問題のある道具を道具市・棚から即時に停止できます。停止すると誰も新たに使えなくなります。
        変更は記録（監査ログ）に残ります。
      </p>
      {gadgets === null && !error && <p className="text-sm text-stone-400">読み込み中…</p>}
      {gadgets?.length === 0 && (
        <p className="nb-panel p-4 text-center text-xs text-stone-500">登録された道具はありません。</p>
      )}
      <div className="grid gap-2">
        {gadgets?.map((gadget) => (
          <div key={gadget.id} className="nb-panel flex items-center gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" style={{ color: 'var(--nb-navy)' }}>
                {gadget.name ?? gadget.id}
              </p>
              <p className="truncate text-xs text-stone-400">
                {gadget.id} ・{' '}
                <span style={{ color: gadget.status === 'suspended' ? 'var(--nb-terra)' : undefined }}>
                  {GADGET_STATUS_LABEL[gadget.status] ?? gadget.status}
                </span>
              </p>
            </div>
            {gadget.status === 'suspended' ? (
              <button
                type="button"
                onClick={() => void setGadgetStatus(gadget, 'published')}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs"
              >
                再開する
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void setGadgetStatus(gadget, 'suspended')}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
              >
                緊急停止
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** 当月の AI 利用（概算）。運営分（platform）とユーザーBYOK（self）を分けて表示。 */
function AiUsageSummary() {
  const [rows, setRows] = useState<Array<{ key_owner: string; total_usd: number; calls: number }> | null>(
    null,
  )
  useEffect(() => {
    adminApi<{ rows: Array<{ key_owner: string; total_usd: number; calls: number }> }>({
      action: 'ai-usage-summary',
    })
      .then((data) => setRows(data.rows))
      .catch(() => setRows([]))
  }, [])

  const usd = (owner: string) => rows?.find((r) => r.key_owner === owner)?.total_usd ?? 0
  const calls = (owner: string) => rows?.find((r) => r.key_owner === owner)?.calls ?? 0
  const yen = (u: number) => `≈ ¥${Math.round(u * JPY_PER_USD).toLocaleString('ja-JP')}`

  return (
    <div className="nb-panel mb-4 p-4 text-sm">
      <p className="text-xs font-semibold text-stone-500">AI利用（今月・概算）</p>
      {rows === null ? (
        <p className="mt-1 text-xs text-stone-400">読み込み中…</p>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-stone-500">運営分（共通埋め込み・代行）</p>
            <p className="text-lg font-bold" style={{ color: 'var(--nb-terra)' }}>
              ${usd('platform').toFixed(3)}{' '}
              <span className="text-xs font-normal text-stone-400">{yen(usd('platform'))}</span>
            </p>
            <p className="text-xs text-stone-400">{calls('platform')}回</p>
          </div>
          <div>
            <p className="text-xs text-stone-500">ユーザーBYOK分（参考）</p>
            <p className="text-lg font-bold" style={{ color: 'var(--nb-navy)' }}>
              ${usd('self').toFixed(3)}{' '}
              <span className="text-xs font-normal text-stone-400">{yen(usd('self'))}</span>
            </p>
            <p className="text-xs text-stone-400">{calls('self')}回</p>
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-stone-400">
        文字数からの粗い概算（正確な額は各社の請求）。運営分は将来 Honmono 運営への引き取り精算の根拠。
      </p>
    </div>
  )
}

/** 部屋番号（号室）のインライン編集。変更があるときだけ「変更」が出る。 */
function RoomNoEditor({
  user,
  onSave,
}: {
  user: AdminUser
  onSave: (roomNo: number | null) => void
}) {
  const [value, setValue] = useState(user.roomNo?.toString() ?? '')
  const parsed = value.trim() === '' ? null : Number(value)
  const valid = parsed === null || (Number.isInteger(parsed) && parsed >= 1)
  const changed = parsed !== user.roomNo
  return (
    <div className="flex w-24 shrink-0 items-center gap-1 text-xs text-stone-500">
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-11 rounded border border-stone-300 px-1 py-0.5"
        title="部屋番号（号室）"
      />
      <span>号室</span>
      {changed && valid && (
        <button
          type="button"
          onClick={() => onSave(parsed)}
          className="underline"
          style={{ color: 'var(--nb-terra)' }}
        >
          変更
        </button>
      )}
    </div>
  )
}

/**
 * アカウント削除の多段確認ダイアログ。誤操作防止のため、対象の識別子
 * （メール、無ければ表示名）を正確に打ち込まないと実行できない。
 */
function DeleteUserDialog({
  user,
  onConfirm,
  onCancel,
}: {
  user: AdminUser
  onConfirm: () => void
  onCancel: () => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const target = user.email ?? user.displayName
  const canDelete = confirmText.trim() === target

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 text-sm shadow-xl">
        <h3 className="text-base font-bold text-red-800">アカウントを削除</h3>
        <p className="mt-2 text-xs leading-relaxed text-stone-700">
          <span className="font-medium">{user.displayName}</span>
          （{user.email ?? 'メールなし'}
          {user.roomNo != null ? ` ・ ${user.roomNo}号` : ''}）を削除します。
          <br />
          このアカウントの個人データ（プロフィール・設定・保存データ・連携キー）は
          すべて消え、<span className="font-medium">元に戻せません</span>。
          作った道具があれば長屋に残ります（大家預かり）。
        </p>
        <p className="mt-3 text-xs text-stone-600">
          確認のため <code className="rounded bg-stone-100 px-1 py-0.5 font-mono">{target}</code>{' '}
          を入力してください：
        </p>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoFocus
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
          placeholder={target}
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-stone-300 px-3 py-2 text-xs"
          >
            やめる
          </button>
          <button
            type="button"
            disabled={!canDelete}
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            削除する
          </button>
        </div>
      </div>
    </div>
  )
}
