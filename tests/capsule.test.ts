import { describe, expect, it } from "vitest";
import { parseCapsule, serializeCapsule, validateCapsule } from "../src/capsule.js";
import example from "../examples/capsule-v1.json" with { type: "json" };

describe("Capsule v1", () => {
  it("validates the checked-in example", () => {
    expect(validateCapsule(example).schema_version).toBe("1.0");
  });

  it("round-trips through JSON", () => {
    const capsule = validateCapsule(example);
    expect(parseCapsule(serializeCapsule(capsule))).toEqual(capsule);
  });

  it("rejects unknown fields and invalid Git SHA values", () => {
    expect(() => validateCapsule({ ...example, unexpected: true })).toThrow();
    expect(() => validateCapsule({ ...example, git: { ...example.git, head: "bad" } })).toThrow();
  });
});
