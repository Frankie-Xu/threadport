import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as subject from './sum.mjs';
import cases from './cases.json' with { type: 'json' };

for (const item of cases) {
  test(item.id, () => assert.equal(subject[item.operation](...item.args), item.expected));
}
