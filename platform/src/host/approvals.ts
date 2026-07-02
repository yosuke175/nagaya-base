import { externalServiceBaseUrls, type GadgetManifest } from 'gadget-sdk'

// Mock of the `installations.granted_permissions` row (docs/architecture.md
// ADR-003, FR-06). Moves to Supabase behind RLS in the Supabase iteration.
const APPROVAL_PREFIX = 'gadget-approval:'

export interface StoredApproval {
  approvedAt: string
  permissions: string[]
  services: Array<{ id: string; baseUrls: string[] }>
}

export function getStoredApproval(gadgetId: string): StoredApproval | null {
  try {
    const raw = localStorage.getItem(APPROVAL_PREFIX + gadgetId)
    return raw ? (JSON.parse(raw) as StoredApproval) : null
  } catch {
    return null
  }
}

export function saveApproval(manifest: GadgetManifest): StoredApproval {
  const approval: StoredApproval = {
    approvedAt: new Date().toISOString(),
    permissions: [...manifest.permissions],
    services: (manifest.externalServices ?? []).map((service) => ({
      id: service.id,
      baseUrls: externalServiceBaseUrls(service),
    })),
  }
  localStorage.setItem(APPROVAL_PREFIX + manifest.id, JSON.stringify(approval))
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
