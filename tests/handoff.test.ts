import { describe, it, expect } from 'vitest';
import { createHandoff, parseHandoff } from '../src/handoff.js';
import { renderCapsuleMarkdown } from '../src/markdown.js';
import { validateCapsule } from '../src/capsule.js';
import example from '../examples/capsule-v1.json' with { type: 'json' };

describe('handoff contracts', () => {
  it('round-trips strict envelope and rejects executable safety flags', () => {
    const envelope = createHandoff(validateCapsule(example), 'codex');
    expect(parseHandoff(JSON.stringify(envelope))).toEqual(envelope);
    expect(() => parseHandoff(JSON.stringify({ ...envelope, protocol: 'threadport.handoff.v2' }))).toThrow();
    expect(() => parseHandoff(JSON.stringify({ ...envelope, safety: { execute_commands: true, modify_workspace: false } }))).toThrow();
  });
  it('rejects uppercase SHA consistently with JSON Schema', () => {
    expect(() => validateCapsule({ ...example, git: { ...example.git, head: 'A'.repeat(40) } })).toThrow();
  });
  it('renders proper table separators and escapes source-controlled markup', () => {
    const capsule = validateCapsule({ ...example, objective: '<script>bad</script>\n# fake heading', commands: [{ command: 'a|b`c\n# pretend', summary: '[click](javascript:bad)' }] });
    const markdown = renderCapsuleMarkdown(capsule);
    expect(markdown).toContain('| --- | --- | --- |');
    expect(markdown).not.toContain('<script>');
    expect(markdown).not.toContain('\n# fake heading');
    expect(markdown).not.toContain('[click](javascript:bad)');
  });
});
