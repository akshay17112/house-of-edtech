import { describe, it, expect } from "vitest";
import { signSyncToken, verifySyncToken } from "./sync-token";

describe("sync token", () => {
  const secret = "test-secret-please-change-me";

  it("round-trips the userId", async () => {
    const token = await signSyncToken("user-123", secret);
    const { userId } = await verifySyncToken(token, secret);
    expect(userId).toBe("user-123");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSyncToken("user-123", secret);
    await expect(verifySyncToken(token, "a-different-secret")).rejects.toThrow();
  });

  it("rejects a tampered token", async () => {
    const token = await signSyncToken("user-123", secret);
    const tampered = `${token.slice(0, -4)}aaaa`;
    await expect(verifySyncToken(tampered, secret)).rejects.toThrow();
  });

  it("requires a non-empty secret to sign", async () => {
    await expect(signSyncToken("user-123", "")).rejects.toThrow();
  });
});
