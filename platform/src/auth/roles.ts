// Role hierarchy per docs/requirements.md §3: admin ⊃ developer ⊃ user ⊃ guest.
// UI checks are auxiliary only — RLS is the final gate (ADR-003).
export const ROLE_ORDER = ['guest', 'user', 'developer', 'admin'] as const

export type AppRole = (typeof ROLE_ORDER)[number]

export function roleAtLeast(role: string, required: AppRole): boolean {
  const index = ROLE_ORDER.indexOf(role as AppRole)
  return index >= 0 && index >= ROLE_ORDER.indexOf(required)
}
