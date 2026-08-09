/** בדיקות הקשר AI — גרסת מסמך 2.0.3 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_CONTEXT } from '../src/context.generated.js';

test('only verified legacy routes are exposed', () => {
  assert.equal(Object.keys(ROUTE_CONTEXT).length, 42);
  for (const route of Object.values(ROUTE_CONTEXT)) {
    assert.match(route.route_id, /^[rt]\d{3}$/);
    assert.ok(route.sources.length >= 1);
    assert.ok(route.stops.length >= 1);
    assert.equal(route.source_scope_note, 'המקורות משויכים למסלול כולו ולא לכל טענה בנפרד.');
  }
});

test('stop identifiers are unique and sources are allowlisted', () => {
  const stopIds = new Set();
  for (const route of Object.values(ROUTE_CONTEXT)) {
    const sourceIds = new Set(route.sources.map((source) => source.source_id));
    for (const stop of route.stops) {
      assert.equal(stopIds.has(stop.stop_id), false);
      stopIds.add(stop.stop_id);
      assert.ok(stop.source_ids.every((id) => sourceIds.has(id)));
    }
  }
});
