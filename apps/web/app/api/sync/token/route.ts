import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { signSyncToken } from "@repo/shared";

/**
 * Mint a short-lived token the browser uses to authenticate to the realtime
 * sync server (apps/sync).
 *
 * Why this exists: the sync server runs on a different origin in production and
 * cannot read the Auth.js session cookie (encrypted + SameSite=Lax). So the
 * editor calls this route — which IS same-origin and can read the session — to
 * get a token signed with AUTH_SECRET, then hands it to the WebSocket.
 *
 * The token only proves *identity* (userId). Per-document authorization
 * (membership + role) is enforced by the sync server when it opens the room, so
 * a token cannot be used to reach a document the user isn't a member of.
 */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "server misconfigured" },
      { status: 500 },
    );
  }

  const token = await signSyncToken(userId, secret);
  return NextResponse.json({ token });
}
