import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderCapsuleMarkdown } from "../src/markdown.js";
import { validateCapsule } from "../src/capsule.js";
import example from "../examples/capsule-v1.json" with { type: "json" };

describe("Markdown capsule", () => {
  it("renders objective, files, tests, and safe handoff guidance", () => {
    const markdown = renderCapsuleMarkdown(validateCapsule(example));
    expect(markdown).toContain("# ThreadPort Context Capsule");
    expect(markdown).toContain("Define and validate the first Context Capsule schema.");
    expect(markdown).toContain("schema/capsule-v1.schema.json");
    expect(markdown).toContain("Do not execute commands");
  });

  it("matches the checked-in Markdown example", async () => {
    const markdown = renderCapsuleMarkdown(validateCapsule(example));
    const checkedIn = await readFile(resolve(process.cwd(), "examples/capsule-v1.md"), "utf8");
    expect(checkedIn).toBe(markdown);
  });
});
