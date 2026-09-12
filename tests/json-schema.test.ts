import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import example from "../examples/capsule-v1.json" with { type: "json" };

describe("Capsule v1 JSON Schema", () => {
  it("accepts the checked-in example", async () => {
    const schema = JSON.parse(await readFile(resolve(process.cwd(), "schema/capsule-v1.schema.json"), "utf8"));
    const AjvConstructor = Ajv as unknown as new (options: { allErrors: boolean; strict: boolean }) => {
      compile: (input: unknown) => ((data: unknown) => boolean) & { errors?: unknown };
    };
    const addFormatsFn = addFormats as unknown as (instance: unknown) => void;
    const ajv = new AjvConstructor({ allErrors: true, strict: true });
    addFormatsFn(ajv);
    const validate = ajv.compile(schema);
    expect(validate(example), JSON.stringify(validate.errors)).toBe(true);
  });
});
