import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../src/components/badge-visits.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const DAY = 86400000;
const START = Date.parse('2026-10-19T23:59:00Z');
function browser(initial) {
  let raw = initial ? JSON.stringify(initial) : null;
  let now = START;
  const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; } };
  return {
    at: value => { now = value; },
    visit(blocked = false) {
      const context = { exports: {}, Date: { now: () => now }, localStorage: blocked ? {
        getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); },
      } : storage, window: { addEventListener() {}, removeEventListener() {} } };
      vm.runInNewContext(source, context);
      context.exports.award();
      return context.exports;
    },
  };
}

test('first visit and repeat effects award only one; opening does not award another', () => {
  const b = browser(); const visit = b.visit();
  visit.award(); visit.open(); visit.open(); visit.award();
  assert.equal(visit.readEarned(), 1);
  assert.equal(visit.readOpened(), 1);
  assert.equal(b.visit().readEarned(), 1);
});
test('midnight and 24h minus 1ms do not qualify; exactly 24h does', () => {
  const b = browser(); b.visit().open();
  b.at(START + 120000); assert.equal(b.visit().readEarned(), 1);
  b.at(START + DAY - 1); assert.equal(b.visit().readEarned(), 1);
  b.at(START + DAY); assert.equal(b.visit().readEarned(), 2);
});
test('a long-lived page cannot earn again; a new visit can', () => {
  const b = browser(); const first = b.visit(); first.open();
  b.at(START + DAY * 3); first.award();
  assert.equal(first.readEarned(), 1);
  assert.equal(b.visit().readEarned(), 2);
});
test('unopened gifts never accumulate; claiming one starts a full wait', () => {
  const b = browser(); b.visit(); b.at(START + DAY * 5);
  const later = b.visit(); assert.equal(later.readEarned(), 1); later.open();
  assert.equal(b.visit().readEarned(), 1);
  b.at(START + DAY * 6); assert.equal(b.visit().readEarned(), 2);
});
test('legacy progress preserves opened badges, limits gifts and waits 24h', () => {
  const b = browser({ earned: 4, opened: 1, last: '2026-10-19' });
  const migrated = b.visit();
  assert.equal(migrated.readOpened(), 1); assert.equal(migrated.readEarned(), 2);
  migrated.open(); assert.equal(b.visit().readEarned(), 2);
  b.at(START + DAY); assert.equal(b.visit().readEarned(), 3);
});
test('clock rollback does not award and progress stops at four badges', () => {
  const b = browser(); b.visit().open();
  b.at(START - DAY); assert.equal(b.visit().readEarned(), 1);
  for (let day = 1; day <= 6; day++) { b.at(START + day * DAY); b.visit().open(); }
  assert.equal(b.visit().readEarned(), 4);
});
test('blocked storage still prevents repeated awards within the page', () => {
  const b = browser(); const first = b.visit(true); first.open();
  b.at(START + DAY); first.award();
  assert.equal(first.readEarned(), 1);
});
