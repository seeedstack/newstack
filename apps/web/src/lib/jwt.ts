// Reads the `sub` claim for display/UI purposes only — the server is the only real
// verifier of this token (ARCHITECTURE §9). No signature check, no dependency needed
// for a one-field read.
export function decodeAccessTokenSubject(token: string): string | null {
  const payload = token.split('.')[1]
  if (payload === undefined) return null
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const claims = JSON.parse(json) as { sub?: unknown }
    return typeof claims.sub === 'string' ? claims.sub : null
  } catch {
    return null
  }
}
