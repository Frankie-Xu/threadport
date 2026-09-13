export interface RedactionResult {
  text: string;
  count: number;
  patterns: string[];
}

type Pattern = { name: string; expression: RegExp };

const patterns: Pattern[] = [
  { name: "private-key", expression: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g },
  { name: "github-token", expression: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g },
  { name: "github-pat", expression: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: "openai-token", expression: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "bearer-token", expression: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi },
  { name: "aws-access-key", expression: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "slack-token", expression: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { name: "secret-assignment", expression: /((?:api[_-]?key|access[_-]?token|secret|password)["']?\s*[:=]\s*["']?)(?!\[REDACTED)[^\s"'{}]{12,}/gi }
];

export function redactSecrets(input: string): RedactionResult {
  let text = input;
  let count = 0;
  const matched = new Set<string>();
  for (const pattern of patterns) {
    text = text.replace(pattern.expression, (match, prefix?: unknown) => {
      count += 1;
      matched.add(pattern.name);
      return typeof prefix === "string" ? `${prefix}[REDACTED]` : `[REDACTED:${pattern.name}]`;
    });
  }
  return { text, count, patterns: [...matched].sort() };
}
