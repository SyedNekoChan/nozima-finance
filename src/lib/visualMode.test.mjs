import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VISUAL_MODE, VISUAL_MODES, nextVisualMode, normalizeVisualMode, visualModeLabel } from './visualMode.js';

test('pet is the default and the fallback for anything unknown', () => {
  assert.equal(DEFAULT_VISUAL_MODE, 'pet');
  for (const v of [null, undefined, '', 'CITY', 'snow', 3, {}]) assert.equal(normalizeVisualMode(v), 'pet');
  for (const m of VISUAL_MODES) assert.equal(normalizeVisualMode(m), m);
});

test('the toggle alternates pet and city', () => {
  assert.equal(nextVisualMode('pet'), 'city');
  assert.equal(nextVisualMode('city'), 'pet');
  assert.equal(nextVisualMode('garbage'), 'city');
});

test('labels are what the header shows', () => {
  assert.equal(visualModeLabel('pet'), 'PET');
  assert.equal(visualModeLabel('city'), 'CITY');
  assert.equal(visualModeLabel(undefined), 'PET');
});
