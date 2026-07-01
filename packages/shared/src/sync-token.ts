// Short-lived token the browser passes to the sync server. The server runs on
// a different origin, so the Auth.js session cookie (SameSite) can't reach it —
// this token, signed with the shared AUTH_SECRET, authenticates the WS handshake.
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
