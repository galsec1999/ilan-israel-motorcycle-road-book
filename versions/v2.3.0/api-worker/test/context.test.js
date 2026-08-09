/** בדיקות תיקי עוזר המסלול — גרסה 2.2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_CONTEXT } from '../src/context.generated.js';

const routes = Object.values(ROUTE_CONTEXT);

test('all 143 published routes have a dossier with an honest support level', () => {
  assert.equal(routes.length, 143);
  assert.equal(routes.filter((route) => route.route_kind === 'legacy').length, 90);
  assert.equal(routes.filter((route) => route.route_kind === 'candidate').length, 53);
  assert.equal(routes.filter((route) => route.support_level === 'route_scope').length, 42);
  assert.equal(routes.filter((route) => route.support_level === 'limited_route_scope').length, 48);
  assert.equal(routes.filter((route) => route.support_level === 'candidate_scope').length, 53);

  for (const route of routes) {
    assert.match(route.route_id, /^(?:[rct]\d{3}|v2-[ncjs]\d{2})$/);
    assert.ok(route.title);
    assert.ok(route.verification_level);
    assert.ok(route.verification_note);
    assert.ok(route.source_scope_note);
    assert.ok(route.sources.length >= 1);
    assert.ok(route.sources.every((source) => source.url.startsWith('https://')));
  }
});

test('legacy dossiers retain the complete authored route material', () => {
  for (const route of routes.filter((item) => item.route_kind === 'legacy')) {
    for (const field of ['summary', 'story', 'cautions', 'checked_on', 'duration', 'km', 'start', 'end']) {
      assert.ok(route[field], `${route.route_id} is missing ${field}`);
    }
    assert.ok(route.stops.length >= 1);
  }
});

test('candidate dossiers expose only documented points and explicit unknowns', () => {
  for (const route of routes.filter((item) => item.route_kind === 'candidate')) {
    assert.equal(route.support_level, 'candidate_scope');
    assert.equal(route.verification_level, 'מועמד באימות');
    assert.equal(route.duration, null);
    assert.equal(route.km, null);
    assert.equal(route.roads, null);
    assert.equal(route.best, null);
    assert.match(route.summary, /אינו מסלול רכיבה מאושר/);
    assert.deepEqual(route.stops.map((stop) => stop.name), route.route_points.slice(1, -1));
  }
});

test('all 659 stop identifiers are unique and source references are allowlisted', () => {
  const stopIds = new Set();
  for (const route of routes) {
    const sourceIds = new Set(route.sources.map((source) => source.source_id));
    for (const stop of route.stops) {
      assert.equal(stopIds.has(stop.stop_id), false);
      stopIds.add(stop.stop_id);
      assert.ok(stop.name);
      assert.ok(stop.story);
      assert.ok(stop.source_ids.length >= 1);
      assert.ok(stop.source_ids.every((id) => sourceIds.has(id)));
    }
  }
  assert.equal(stopIds.size, 659);
});

test('excluded corridors are not promoted into route dossiers', () => {
  const titles = routes.map((route) => route.title).join('\n');
  assert.doesNotMatch(titles, /יער חניתה/);
  assert.doesNotMatch(titles, /דרך נוף הרי נפתלי/);
  assert.doesNotMatch(titles, /סוסיתא דרך אמפי גולן/);
});
