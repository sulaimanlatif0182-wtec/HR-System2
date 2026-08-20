import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDistanceMeters,
  DEFAULT_ATTENDANCE_SITES,
  DEFAULT_OT_WINDOWS,
} from './attendanceLogic.js';

test('getDistanceMeters returns 0 for the same point', () => {
  assert.equal(getDistanceMeters(2.9662584, 101.8372782, 2.9662584, 101.8372782), 0);
});

test('getDistanceMeters is symmetric', () => {
  const a = getDistanceMeters(2.9662584, 101.8372782, 2.967353, 101.836689);
  const b = getDistanceMeters(2.967353, 101.836689, 2.9662584, 101.8372782);
  assert.ok(Math.abs(a - b) < 0.001);
});

test('getDistanceMeters ~111m per 0.001 degree of latitude', () => {
  const d = getDistanceMeters(2.9662584, 101.8372782, 2.9672584, 101.8372782);
  assert.ok(d > 100 && d < 130, `got ${d}`);
});

test('default sites are the two factories with 100m radius', () => {
  assert.equal(DEFAULT_ATTENDANCE_SITES.length, 2);
  for (const site of DEFAULT_ATTENDANCE_SITES) {
    assert.equal(site.radiusMeters, 100);
    assert.ok(site.name);
  }
});

test('default OT windows cover 17:46 to 24:00 in ascending steps', () => {
  assert.equal(DEFAULT_OT_WINDOWS.length, 13);
  assert.equal(DEFAULT_OT_WINDOWS[0].start, 17 * 60 + 46);
  assert.equal(DEFAULT_OT_WINDOWS[DEFAULT_OT_WINDOWS.length - 1].end, 24 * 60);
  assert.equal(DEFAULT_OT_WINDOWS[0].hours, 0.5);
  assert.equal(DEFAULT_OT_WINDOWS[DEFAULT_OT_WINDOWS.length - 1].hours, 6.5);

  for (let i = 1; i < DEFAULT_OT_WINDOWS.length; i += 1) {
    assert.ok(DEFAULT_OT_WINDOWS[i].start > DEFAULT_OT_WINDOWS[i - 1].start);
    assert.ok(DEFAULT_OT_WINDOWS[i].hours > DEFAULT_OT_WINDOWS[i - 1].hours);
  }
});

test('OT window matching picks the correct block', () => {
  const match = (now) =>
    DEFAULT_OT_WINDOWS.find((w) => now >= w.start && now <= w.end);

  assert.equal(match(1066)?.hours, 0.5);
  assert.equal(match(1070)?.hours, 0.5);
  assert.equal(match(1095)?.hours, 0.5);
  assert.equal(match(1096)?.hours, 1);
  assert.equal(match(1400)?.hours, 6);
  assert.equal(match(1440)?.hours, 6.5);
  assert.equal(match(1040), undefined);
  assert.equal(match(900), undefined);
});