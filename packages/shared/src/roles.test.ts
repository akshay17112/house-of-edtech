import { describe, it, expect } from "vitest";
import { canWrite, canDelete } from "./roles";

describe("role permissions", () => {
  it("lets owners and editors write, but not viewers", () => {
    expect(canWrite("owner")).toBe(true);
    expect(canWrite("editor")).toBe(true);
    expect(canWrite("viewer")).toBe(false);
  });

  it("lets only owners delete", () => {
    expect(canDelete("owner")).toBe(true);
    expect(canDelete("editor")).toBe(false);
    expect(canDelete("viewer")).toBe(false);
  });
});
