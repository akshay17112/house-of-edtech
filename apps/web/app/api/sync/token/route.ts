import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { signSyncToken } from "@repo/shared";

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
