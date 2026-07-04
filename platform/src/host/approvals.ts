import { externalServiceBaseUrls, type GadgetManifest } from 'gadget-sdk'
import { currentUserId, supabase } from '../auth/supabaseClient'

// インストール時の権限承認（FR-06）。以前は端末ごとの localStorage だけだったため、
// 別端末や再ログインのたびに承認をやり直させていた。承認はユーザー単位で
// installations.granted_permissions（jsonb）に保存し、端末をまたいで保持する。
// 未ログインのローカル開発では localStorage にフォールバックする。
const APPROVAL_PREFIX = 'gadget-approval:'

export interface StoredApproval {
  approvedAt: string
  permissions: string[]
  services: Array<{ id: string; baseUrls: string[] }>
}

function buildApproval(manifest: GadgetManifest): StoredApproval {
  return {
    approvedAt: new Date().toISOString(),
    permissions: [...manifest.permissions],
    services: (manifest.externalServices ?? []).map((service) => ({
      id: service.id,
      baseUrls: externalServiceBaseUrls(service),
    })),
  }
}

function isStoredApproval(value: unknown): value is StoredApproval {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.permissions) && Array.isArray(v.services)
}

function localGet(gadgetId: string): StoredApproval | null {
  try {
    const raw = localStorage.getItem(APPROVAL_PREFIX + gadgetId)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return isStoredApproval(parsed) ? parsed : null
  } catch {
    return null
  }
}

function localSet(gadgetId: string, approval: StoredApproval): void {
  localStorage.setItem(APPROVAL_PREFIX + gadgetId, JSON.stringify(approval))
}

/** 承認内容を読む。ログイン時は installations 行、未ログインは localStorage。 */
export async function loadApproval(gadgetId: string): Promise<StoredApproval | null> {
  const userId = await currentUserId()
  if (supabase && userId) {
    const { data, error } = await supabase
      .from('installations')
      .select('granted_permissions')
      .eq('gadget_id', gadgetId)
      .maybeSingle()
    if (error || !data) return localGet(gadgetId) // 取れない時はローカルキャッシュを試す
    const granted = (data as { granted_permissions?: unknown }).granted_permissions
    return isStoredApproval(granted) ? granted : null
  }
  return localGet(gadgetId)
}

/** 承認を保存。ログイン時は installations 行に保存し、端末間で保持する。 */
export async function persistApproval(manifest: GadgetManifest): Promise<StoredApproval> {
  const approval = buildApproval(manifest)
  localSet(manifest.id, approval) // ローカルにもキャッシュ（オフライン/フォールバック用）
  const userId = await currentUserId()
  if (supabase && userId) {
    // インストール行が既にある前提（承認カードはインストール後に出る）
    await supabase
      .from('installations')
      .update({ granted_permissions: approval })
      .eq('gadget_id', manifest.id)
  }
  return approval
}

/**
 * An approval is current when it covers everything the manifest asks for
 * now. Newly added permissions, services, or baseUrls require re-approval
 * (docs/gadget-spec.md §5).
 */
export function isApprovalCurrent(
  manifest: GadgetManifest,
  approval: StoredApproval | null,
): boolean {
  if (!approval) return false
  const grantedPermissions = new Set(approval.permissions)
  if (!manifest.permissions.every((permission) => grantedPermissions.has(permission))) {
    return false
  }
  return (manifest.externalServices ?? []).every((service) => {
    const granted = approval.services.find((entry) => entry.id === service.id)
    if (!granted) return false
    const grantedUrls = new Set(granted.baseUrls)
    return externalServiceBaseUrls(service).every((url) => grantedUrls.has(url))
  })
}
