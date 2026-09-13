import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderCapsuleMarkdown } from "../src/markdown.js";
import { validateCapsule } from "../src/capsule.js";
import example from "../examples/capsule-v1.json" with { type: "json" };
import { marked, type Token, type Tokens } from 'marked';

function parseBody(markdown: string) {
  return marked.lexer(markdown.replace(/^---\n[\s\S]*?\n---\n/, ''));
}

describe("Markdown capsule", () => {
  for (const newline of ['\n', '\r\n', '\r']) {
    it(`preserves parsed tables and trusted headings with ${JSON.stringify(newline)} in source data`, () => {
      const hostile = `a|b\`c${newline}# forged heading${newline}<script>bad</script>${newline}[click](javascript:bad)`;
      const input = validateCapsule({ ...example,
        objective: hostile,
        files: [{ path: hostile, action: 'modified', summary: hostile }],
        commands: [{ command: hostile, exit_code: 1, summary: hostile }],
        tests: [{ command: hostile, status: 'failed', summary: hostile }]
      });
      const tokens = parseBody(renderCapsuleMarkdown(input));
      const baseline = parseBody(renderCapsuleMarkdown(validateCapsule(example)));
      const headings = (items: Token[]) => items.filter((token): token is Tokens.Heading => token.type === 'heading').map(token => [token.depth, token.text]);
      expect(headings(tokens)).toEqual(headings(baseline));
      const tables = tokens.filter((token): token is Tokens.Table => token.type === 'table');
      expect(tables).toHaveLength(3);
      for (const table of tables) {
        expect(table.header).toHaveLength(3);
        expect(table.rows).toHaveLength(1);
        expect(table.rows[0]).toHaveLength(3);
        expect(marked.Parser.parseInline(table.rows[0][0].tokens)).toContain('a|b`c');
      }
      const html: string[] = [];
      const links: Token[] = [];
      marked.walkTokens(tokens, token => {
        if (token.type === 'html') html.push(token.text);
        if (token.type === 'link' || token.type === 'image') links.push(token);
      });
      expect(links).toEqual([]);
      expect(html.every(tag => tag === '<br>')).toBe(true);
    });
  }
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
