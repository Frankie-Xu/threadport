import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/redact.js";

describe("secret redaction", () => {
  it('redacts partial keys and quoted assignments without re-redacting placeholders', () => {
    expect(redactSecrets('-----BEGIN PRIVATE KEY-----SYNTHETIC').text).not.toContain('SYNTHETIC');
    const once = redactSecrets('{"password":"synthetic-password-value"}');
    expect(once.text).not.toContain('synthetic-password-value');
    expect(redactSecrets(once.text).count).toBe(0);
  });
  it("redacts common credentials without changing ordinary prose", () => {
    const input = "token_count=12 api_key=super-secret-value-12345 and ghp_12345678901234567890123456789012";
    const result = redactSecrets(input);
    expect(result.text).toContain("token_count=12");
    expect(result.text).toContain("[REDACTED]");
    expect(result.text).not.toContain("ghp_12345678901234567890123456789012");
    expect(result.count).toBe(2);
  });

  it("redacts private keys and bearer tokens", () => {
    const result = redactSecrets("Bearer abcdefghijklmnop1234\n-----BEGIN PRIVATE KEY-----secret-----END PRIVATE KEY-----");
    expect(result.text).not.toContain("abcdefghijklmnop1234");
    expect(result.text).not.toContain("BEGIN PRIVATE KEY");
    expect(result.count).toBe(2);
  });
});
