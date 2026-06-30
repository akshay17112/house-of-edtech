/**
 * Sync-server access tokens.
 *
 * The realtime WebSocket server (apps/sync) lives on a DIFFERENT origin from
 * the Next.js app in production (Vercel ⇄ Railway). Auth.js session cookies are
 * encrypted and `SameSite=Lax`, so the browser will not send them on a
 * cross-site WebSocket handshake — cookie auth simply does not reach the socket.
 *
 * Instead the web app mints a short-lived token the moment the editor opens,
 * the browser hands it to the socket as a query param, and the sync server
 * verifies it with the SAME `AUTH_SECRET`. Both sides import THIS file, so the
 * signing and verification can never drift apart.
 *
 * The token only authenticates the handshake (the connection then lives as long
 * as the tab is open), so a short TTL is safe and limits replay.
 */
import { SignJWT, jwtVerify } from "jose";

const ALG = "HS256";
const AUDIENCE = "sync";
const TTL = "5m";

function key(secret: string): Uint8Array {
  if (!secret) {
    throw new Error("AUTH_SECRET is required to sign/verify sync tokens");
  }
  return new TextEncoder().encode(secret);
}

/** Mint a short-lived token proving the given user's identity to apps/sync. */
export async function signSyncToken(
  userId: string,
  secret: string,
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALG })
    .setSubject(userId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(key(secret));
}

/**
 * Verify a sync token and return the trusted userId.
 * Throws if the token is missing, malformed, expired, or signed by another key.
 */
export async function verifySyncToken(
  token: string,
  secret: string,
): Promise<{ userId: string }> {
  const { payload } = await jwtVerify(token, key(secret), {
    audience: AUDIENCE,
  });
  if (!payload.sub) throw new Error("sync token has no subject");
  return { userId: payload.sub };
}
