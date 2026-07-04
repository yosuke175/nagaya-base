import { useEffect, useState } from 'react'
import { getAccessToken } from '../host/credentialsApi'

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
      {users === null && !error && <p className="text-sm text-stone-400">読み込み中…</p>}

      <div className="grid gap-2">
        {users?.map((user) => (
          <div key={user.id} className="nb-panel flex items-center gap-3 p-3 text-sm">
            <span className="w-12 shrink-0 text-xs text-stone-400">
              {user.roomNo != null ? `${user.roomNo}号` : '—'}
            </span>
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
          </div>
        ))}
      </div>

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
