import { createHmac, timingSafeEqual } from "node:crypto";

// Signed links from the LINE chat to the member page (app/line/member): the token names the LINE account and when
// it expires, signed with a key derived from the channel secret, so the page knows who opened it without a LINE
// login and nobody can forge one for someone else's account. Pure (the secret is passed in) so it is easy to test.

const b64 = (value: string) => Buffer.from(value).toString("base64url");
const sign = (payload: string, secret: string) => createHmac("sha256", `${secret}:line-member`).update(payload).digest("base64url");

export function signLineToken(lineUser: string, secret: string, days = 1, now = Date.now()) {
  const payload = b64(JSON.stringify({ u: lineUser, e: now + days * 86400000 }));
  return `${payload}.${sign(payload, secret)}`;
}

// The LINE user a token was issued to, or null (no secret, malformed, tampered with, or expired).
export function readLineToken(token: unknown, secret: string, now = Date.now()): string | null {
  if (!secret || typeof token !== "string" || token.length > 600) return null;
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, secret)), given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof data.u === "string" && /^U[0-9a-f]{32}$/.test(data.u) && Number(data.e) > now ? data.u : null;
  } catch { return null; }
}
