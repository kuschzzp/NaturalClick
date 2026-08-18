import { describe, expect, it } from "vitest";
import { isSensitiveKey, redactSensitiveString, redactSensitiveValue, safeRedactedJson } from "../../../src/core/architecture/redaction";

describe("redaction", () => {
  it("redacts sensitive object fields while preserving boolean capability flags", () => {
    const redacted = redactSensitiveValue({
      apiKey: "sk-super-secret-key",
      nested: {
        Authorization: "Bearer token-value",
        hasApiKey: true,
        endpointConfigured: true
      }
    });

    expect(redacted).toEqual({
      apiKey: "[redacted]",
      nested: {
        Authorization: "[redacted]",
        hasApiKey: true,
        endpointConfigured: true
      }
    });
    expect(isSensitiveKey("hasApiKey", true)).toBe(false);
    expect(isSensitiveKey("apiKey", "value")).toBe(true);
  });

  it("redacts secrets embedded in strings and urls", () => {
    const text = [
      "Authorization: Bearer abcdefghijklmnop",
      "apiKey=sk-1234567890abcdef",
      "https://example.test/models?api_key=sk-url-secret-token&view=list",
      "plain sk-abcdef1234567890"
    ].join("\n");

    const redacted = redactSensitiveString(text);

    expect(redacted).not.toContain("abcdefghijklmnop");
    expect(redacted).not.toContain("sk-1234567890abcdef");
    expect(redacted).not.toContain("sk-url-secret-token");
    expect(redacted).not.toContain("sk-abcdef1234567890");
    expect(redacted).toContain("Authorization: Bearer [redacted]");
    expect(redacted).toContain("api_key=[redacted]");
  });

  it("serializes redacted JSON safely with circular and long values", () => {
    const record: Record<string, unknown> = {
      message: `token: secret-token ${"x".repeat(20)}`,
      api_key: "sk-json-secret"
    };
    record.self = record;

    const json = safeRedactedJson(record, { maxStringLength: 18 });

    expect(json).toContain("[redacted]");
    expect(json).toContain("[circular]");
    expect(json).toContain("[truncated");
    expect(json).not.toContain("secret-token");
    expect(json).not.toContain("sk-json-secret");
  });
});
