// ARCHITECTURE §9: verify/reset links carry the token in the URL fragment (`#t=<token>`)
// so it never reaches the server or Referer. Read once on mount, then the page POSTs it.
export function readTokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  return params.get('t')
}
