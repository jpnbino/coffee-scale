import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewSteps, minimumPitch, emptyRecord, mark, progress, nextPending, exportRecord, recordMatches, storageKey } from '../web/review-record.mjs';

const pad = (number, name, x, y, extra = {}) => ({ number, name, x, y, net: `/N${number}`, type: 'smd', ...extra });
const check = {
  parts: [
    { ref: 'U1', value: 'MCU', footprint: 'QFN-16', pads: Array.from({ length: 8 }, (_, i) => pad(String(i + 1), `IO${i}`, i * 0.5, 0)) },
    { ref: 'Q1', value: 'BSS138', footprint: 'SOT-23', pads: [pad('1', 'G', 0, 0), pad('2', 'S', 1.9, 0), pad('3', 'D', 0.95, 2)] },
    { ref: 'R1', value: '10k', footprint: '0402', pads: [pad('1', '1', 0, 0), pad('2', '2', 1, 0)] },
  ],
  findings: [
    { kind: 'placement', ref: 'J3', at: [1, 2], message: 'Placement point is off.' },
    { kind: 'paste-coverage', ref: 'U1', at: [0, 0], message: 'Paste covers 30 %.' },
    { kind: 'placement', ref: 'J3', at: [1, 2], message: 'Duplicate.' },
  ],
};

test('minimum pitch is the closest pad pair', () => {
  assert.equal(minimumPitch(check.parts[0].pads), 0.5);
  assert.equal(minimumPitch([pad('1', 'A', 0, 0)]), null);
});

test('steps: findings first, then pin-map parts smallest first, no repeats', () => {
  const steps = reviewSteps(check);
  assert.deepEqual(steps.map(s => s.id), ['finding:placement:J3', 'finding:paste-coverage:U1', 'pinmap:Q1', 'pinmap:U1']);
  assert.equal(steps[1].kind, 'paste');
  assert.equal(steps[3].fine, true);
  assert.match(steps[3].prompt, /Fine pitch \(0\.5 mm\)/);
  assert.equal(steps[2].fine, false);
  assert.deepEqual(reviewSteps(null), []);
});

test('marking, progress and the next pending step', () => {
  const steps = reviewSteps(check);
  const now = new Date('2026-11-28T10:00:00Z');
  let record = emptyRecord({ boardSha256: 'abc', revision: 'Rev E', now });
  assert.equal(nextPending(record, steps), 0);
  record = mark(record, steps[0].id, 'ok', '', now);
  record = mark(record, steps[2].id, 'change', '  swap pins 1 and 2 ', now);
  assert.deepEqual(progress(record, steps), { total: 4, ok: 1, change: 1, pending: 2, done: 2 });
  assert.equal(record.items[steps[2].id].note, 'swap pins 1 and 2');
  assert.equal(nextPending(record, steps, 0), 1);
  assert.equal(nextPending(record, steps, 1), 3);
  record = mark(record, steps[0].id, 'pending');
  assert.equal(record.items[steps[0].id], undefined);
  assert.throws(() => mark(record, steps[0].id, 'approved'), /Unknown review status/);
});

test('exported record reads on its own and is honest about what it is', () => {
  const steps = reviewSteps(check);
  const now = new Date('2026-11-28T10:00:00Z');
  let record = emptyRecord({ boardSha256: 'abc', revision: 'Rev E', reviewer: 'jp', now });
  for (const step of steps) record = mark(record, step.id, 'ok', '', now);
  const out = exportRecord(record, steps, now);
  assert.equal(out.completed, now.toISOString());
  assert.deepEqual(out.summary, { steps: 4, looksRight: 4, needsChange: 0, notReviewed: 0 });
  assert.equal(out.items[0].prompt, 'Placement point is off.');
  assert.match(out.note, /Not a test result/);
  const partial = exportRecord(mark(record, steps[1].id, 'pending'), steps, now);
  assert.equal(partial.completed, null);
  assert.equal(partial.items[1].status, 'pending');
});

test('records belong to one board', () => {
  const record = emptyRecord({ boardSha256: 'abc' });
  assert.equal(recordMatches(record, 'abc'), true);
  assert.equal(recordMatches(record, 'def'), false);
  assert.equal(recordMatches(null, 'abc'), false);
  assert.equal(storageKey('abc'), 'coffee-scale:pre-order-review:abc');
});
