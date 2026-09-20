import { describe, expect, it } from 'vitest';
import { createTaskSchema, taskPatchSchema, taskSchema, taskWriteSchema } from '../../src/contracts/task.js';
import { validateTaskInput } from '../../src/tasks/contracts.js';

describe('task validation contracts', () => {
  it('keeps mutation limits and rejects unknown fields', () => {
    expect(taskPatchSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(taskPatchSchema.safeParse({ title: 'x'.repeat(121) }).success).toBe(false);
    expect(taskPatchSchema.safeParse({ objective: 'x'.repeat(8001) }).success).toBe(false);
    expect(taskPatchSchema.safeParse({ unknown: true }).success).toBe(false);
    expect(taskPatchSchema.safeParse({ constraints: Array.from({ length: 51 }, () => 'x') }).success).toBe(false);
    expect(() => validateTaskInput(taskPatchSchema, { title: '   ' })).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });

  it('validates create inputs with the shared identifier rules', () => {
    expect(createTaskSchema.parse({ projectId: 'project-1', title: 'Task' })).toEqual({
      projectId: 'project-1',
      title: 'Task',
    });
    expect(createTaskSchema.safeParse({ projectId: '', title: 'Task' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ projectId: 'project-1', title: 'Task', extra: true }).success).toBe(false);
  });

  it('keeps persisted task and write schemas aligned', () => {
    const claim = { text: 'Objective', origin: 'user-confirmed' as const, evidence: [], updatedAt: null };
    const task = {
      id: 'task-1',
      projectId: 'project-1',
      revision: 1,
      title: 'Task',
      objective: claim,
      constraints: [],
      nextAction: { ...claim, text: 'Run tests' },
      lifecycle: 'active' as const,
      archived: false,
      createdAt: '2026-09-19T00:00:00.000Z',
      updatedAt: '2026-09-19T00:00:00.000Z',
    };

    expect(taskSchema.parse(task)).toEqual(task);
    expect(taskWriteSchema.parse(task)).toEqual(task);
    expect(taskWriteSchema.safeParse({ ...task, objective: { ...claim, text: 'x'.repeat(8001) } }).success).toBe(false);
  });
});
