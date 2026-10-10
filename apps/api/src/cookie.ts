// Minimal Cookie header read + Set-Cookie build — only one cookie (the refresh token) is
// in play, so a small dependency-free helper beats pulling in a cookie library.
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

export function buildSetCookie(
  name: string,
  value: string,
  opts: { path: string; maxAgeSeconds?: number }
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path}`, "HttpOnly", "Secure", "SameSite=Strict"];
  if (opts.maxAgeSeconds !== undefined) parts.push(`Max-Age=${opts.maxAgeSeconds}`);
  return parts.join("; ");
}
