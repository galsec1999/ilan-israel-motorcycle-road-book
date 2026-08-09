/**
 * שער האיכות המקומי
 * גרסת מסמך: 2.4.0
 * גרסת מוצר: 2.4.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { buildAudit } from '../tools/audit-release-routes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const APP_VERSION = '2.4.0';
const CATALOGUE_VERSION = '2.3.0';

function evaluateAll() {
  const context = vm.createContext({ window: {} });
  for (const relative of [
    `data/config-v${APP_VERSION}.js`,
    'data/legacy-content-v2.js',
    'data/new-routes-v2.js',
    `data/route-expansion-v${CATALOGUE_VERSION}.js`,
    `data/release-audit-v${CATALOGUE_VERSION}.js`,
  ]) vm.runInContext(read(relative), context, { filename: relative });
  return context.window;
}

const data = evaluateAll();
const legacy = data.ROAD_BOOK_LEGACY;
const additions = data;
const config = data.ROAD_BOOK_CONFIG;
const release = data.ROAD_BOOK_RELEASE_AUDIT;
const expansion = data.ROAD_BOOK_V23_EXPANSION;
const catalogueRoutes = [...legacy.routes, ...expansion.routes];
const manifest = JSON.parse(read(`manifest-${APP_VERSION}.webmanifest`));
const index = read('index.html');
const app = read(`assets/app-v${APP_VERSION}.js`);
const css = read(`assets/app-v${APP_VERSION}.css`);
const serviceWorker = read('sw.js');

function appFunctionSection(name, nextName) {
  const start = app.indexOf(`function ${name}(`);
  const end = nextName ? app.indexOf(`function ${nextName}(`, start + 1) : app.length;
  assert.ok(start >= 0, `function ${name}`);
  assert.ok(end > start, `function ${name} -> ${nextName}`);
  return app.slice(start, end);
}

function canonicalPlace(value) {
  return String(value || '').trim().toLocaleLowerCase('he')
    .replace(/[״׳"'–—־,:()]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:גן לאומי|שמורת טבע|מרכז המבקרים(?: של)?|חניון|פארק|מוזאון|מוזיאון)\s+/, '')
    .replace(/\s+(?:נקודת ניווט כללית|נקודת מעבר בלבד|נקודת הקהילה|גישה לפארק|סגור.*)$/u, '')
    .trim();
}

function corePlaceSet(route) {
  const contentPoints = Array.isArray(route.stops) && route.stops.length
    ? route.stops.map((stop) => stop.name || stop.navigation_name)
    : (route.map_points || [route.start, route.end]);
  return new Set(contentPoints
    .map(canonicalPlace).filter(Boolean));
}

function sharedPlaceCount(a, b) {
  return [...a].filter((point) => b.has(point)).length;
}

test('קטלוג 2.3.0 משמר את כל חומר המקור ואת צילומי 2.2.0–2.3.0', () => {
  assert.equal(legacy.routes.length, 90);
  assert.equal(legacy.multiday.length, 18);
  assert.equal(legacy.grandTours.length, 3);
  assert.equal(new Set(legacy.routes.map((route) => route.id)).size, 90);
  assert.equal(additions.ROAD_BOOK_V2_CANDIDATES.length, 53);
  assert.equal(new Set(additions.ROAD_BOOK_V2_CANDIDATES.map((route) => route.id)).size, 53);
  assert.ok(fs.existsSync(path.join(root, 'versions', 'v2.2.0', 'index.html')));
  assert.ok(fs.existsSync(path.join(root, 'versions', 'v2.2.1', 'index.html')));
  assert.ok(fs.existsSync(path.join(root, 'versions', 'v2.2.2', 'index.html')));
  assert.ok(fs.existsSync(path.join(root, 'versions', 'v2.2.3', 'index.html')));
  assert.ok(fs.existsSync(path.join(root, 'versions', 'v2.2.4', 'index.html')));
  assert.ok(fs.existsSync(path.join(root, 'versions', `v${CATALOGUE_VERSION}`, 'index.html')));
  assert.match(read('versions/v2.2.4/index.html'), /גרסה 2\.2\.4/);
  for (const preserved of [
    'versions/v2.2.3/assets/app-v2.2.3.js',
    'versions/v2.2.3/assets/app-v2.2.3.css',
    'versions/v2.2.3/data/config-v2.2.3.js',
    'versions/v2.2.3/data/release-audit-v2.2.3.js',
    'versions/v2.2.3/manifest-2.2.3.webmanifest',
    'versions/v2.2.3/offline-2.2.3.html',
    'versions/v2.2.3/reports/route-release-audit-2.2.3.json',
  ]) assert.ok(fs.existsSync(path.join(root, preserved)), preserved);
  for (const preserved of [
    `versions/v${CATALOGUE_VERSION}/index.html`,
    `versions/v${CATALOGUE_VERSION}/assets/app-v${CATALOGUE_VERSION}.js`,
    `versions/v${CATALOGUE_VERSION}/assets/app-v${CATALOGUE_VERSION}.css`,
    `versions/v${CATALOGUE_VERSION}/data/config-v${CATALOGUE_VERSION}.js`,
    `versions/v${CATALOGUE_VERSION}/data/route-expansion-v${CATALOGUE_VERSION}.js`,
    `versions/v${CATALOGUE_VERSION}/data/release-audit-v${CATALOGUE_VERSION}.js`,
    `versions/v${CATALOGUE_VERSION}/manifest-${CATALOGUE_VERSION}.webmanifest`,
    `versions/v${CATALOGUE_VERSION}/offline-${CATALOGUE_VERSION}.html`,
  ]) assert.ok(fs.existsSync(path.join(root, preserved)), preserved);
  assert.match(read(`versions/v${CATALOGUE_VERSION}/index.html`), /גרסה 2\.3\.0/);
  assert.doesNotMatch(read(`versions/v${CATALOGUE_VERSION}/index.html`), /גרסה 2\.4\.0/);
  for (const [snapshot, historical] of [
    [`versions/v${CATALOGUE_VERSION}/assets/app-v${CATALOGUE_VERSION}.js`, `assets/app-v${CATALOGUE_VERSION}.js`],
    [`versions/v${CATALOGUE_VERSION}/assets/app-v${CATALOGUE_VERSION}.css`, `assets/app-v${CATALOGUE_VERSION}.css`],
    [`versions/v${CATALOGUE_VERSION}/data/config-v${CATALOGUE_VERSION}.js`, `data/config-v${CATALOGUE_VERSION}.js`],
    [`versions/v${CATALOGUE_VERSION}/data/route-expansion-v${CATALOGUE_VERSION}.js`, `data/route-expansion-v${CATALOGUE_VERSION}.js`],
    [`versions/v${CATALOGUE_VERSION}/data/release-audit-v${CATALOGUE_VERSION}.js`, `data/release-audit-v${CATALOGUE_VERSION}.js`],
    [`versions/v${CATALOGUE_VERSION}/manifest-${CATALOGUE_VERSION}.webmanifest`, `manifest-${CATALOGUE_VERSION}.webmanifest`],
    [`versions/v${CATALOGUE_VERSION}/offline-${CATALOGUE_VERSION}.html`, `offline-${CATALOGUE_VERSION}.html`],
  ]) assert.equal(read(snapshot), read(historical), `${snapshot} != ${historical}`);
  assert.ok(fs.existsSync(path.join(root, 'reports', 'route-release-audit-2.2.1.json')));
  assert.ok(fs.existsSync(path.join(root, 'reports', 'ROUTE_RELEASE_AUDIT_2_2_1.md')));

  const known = new Set(legacy.routes.map((route) => route.id));
  for (const route of legacy.routes) {
    for (const connection of route.connections || []) {
      assert.ok(known.has(connection), `${route.id} -> ${connection}`);
    }
  }
});

test('שכבת השחרור מפרידה 90 PASS, ‏90 warning ו־53 research מוסתרים', () => {
  assert.equal(release.version, CATALOGUE_VERSION);
  assert.equal(release.publish_candidates, false);
  assert.equal(release.publish_with_warnings, true);
  assert.equal(release.release_ready_route_ids.length, 90);
  assert.equal(release.withheld_legacy_route_ids.length, 90);
  assert.equal(new Set(release.release_ready_route_ids).size, release.release_ready_route_ids.length);
  assert.equal(new Set(release.withheld_legacy_route_ids).size, release.withheld_legacy_route_ids.length);
  assert.equal(release.release_ready_route_ids.filter((id) => release.withheld_legacy_route_ids.includes(id)).length, 0);
  assert.equal(release.release_ready_route_ids.length + release.withheld_legacy_route_ids.length, catalogueRoutes.length);
  const exclusions = new Map(release.catalogue_exclusions
    .filter((item) => item.route_id)
    .map((item) => [item.route_id, item.reason]));
  for (const id of release.withheld_legacy_route_ids) assert.ok(exclusions.get(id), id);

  const sourceIds = new Set(catalogueRoutes.map((route) => route.id));
  assert.ok(release.release_ready_route_ids.every((id) => sourceIds.has(id)));
  assert.ok(release.withheld_legacy_route_ids.every((id) => sourceIds.has(id)));
  assert.deepEqual(new Set(Object.keys(release.route_results)), sourceIds);
  for (const route of catalogueRoutes) {
    const result = release.route_results[route.id];
    assert.ok(result, route.id);
    assert.ok(['pass', 'warning'].includes(result.status), route.id);
    if (result.status === 'pass') {
      assert.ok(release.release_ready_route_ids.includes(route.id), route.id);
      assert.ok(Object.values(result.checks).every((value) => value === true), route.id);
    } else {
      assert.ok(release.withheld_legacy_route_ids.includes(route.id), route.id);
      assert.ok(result.reason, route.id);
      assert.equal(result.reason, exclusions.get(route.id), route.id);
    }
  }
  assert.equal(Object.values(release.route_results).filter((result) => result.status === 'pass').length, 90);
  assert.equal(Object.values(release.route_results).filter((result) => result.status === 'warning').length, 90);
  assert.match(app, /releaseAudit\.route_results/);
  assert.match(app, /release_audit_status/);
  assert.match(app, /release_has_issue/);
  assert.match(app, /release_issue_reason/);
  assert.doesNotMatch(app, /release_audit_status:\s*'עבר ביקורת שחרור טכנית'/);
});

test('כל 90 מסלולי ההערות מסווגים בדיוק פעם אחת בשלוש הקטגוריות', () => {
  const allowed = new Set(['minor_navigation', 'conditional', 'major']);
  const entries = Object.entries(release.warning_severity || {});
  const warningIds = new Set(release.withheld_legacy_route_ids);
  const passIds = new Set(release.release_ready_route_ids);
  assert.equal(entries.length, 90);
  assert.equal(new Set(entries.map(([id]) => id)).size, 90);
  assert.deepEqual([...entries.map(([id]) => id)].sort(), [...warningIds].sort());
  assert.ok(entries.every(([, severity]) => allowed.has(severity)));
  assert.equal(entries.filter(([id]) => passIds.has(id)).length, 0);
  const counts = Object.fromEntries([...allowed].map((severity) => [
    severity,
    entries.filter(([, value]) => value === severity).length,
  ]));
  assert.equal(Object.values(counts).reduce((sum, value) => sum + value, 0), 90);
  assert.ok(Object.values(counts).every((value) => value > 0));
});

test('הרחבת 2.3.0 כוללת 90 מסלולים אמיתיים, יציאה מהמרכז ולפחות 45 לולאות או מסלולי נחש', () => {
  assert.equal(expansion.version, CATALOGUE_VERSION);
  assert.equal(expansion.release_complete, true);
  assert.equal(expansion.routes.length, 90);
  assert.equal(expansion.pass_route_ids.length, 45);
  assert.equal(expansion.warning_route_ids.length, 45);
  assert.equal(new Set(expansion.routes.map((route) => route.id)).size, 90);
  assert.equal(expansion.routes.filter((route) => ['loop', 'snake'].includes(route.route_pattern)).length >= 45, true);
  const legacyIds = new Set(legacy.routes.map((route) => route.id));
  assert.ok(expansion.routes.every((route) => !legacyIds.has(route.id)));
  const legacyPointSets = legacy.routes.map((route) => ({ id: route.id, points: corePlaceSet(route) }));
  for (const route of expansion.routes) {
    const candidate = corePlaceSet(route);
    for (const reference of legacyPointSets) {
      const shared = sharedPlaceCount(candidate, reference.points);
      assert.ok(shared < 2 || candidate.size - shared >= 2, `${route.id} duplicates ${reference.id}`);
    }
  }
  for (let index = 0; index < expansion.routes.length; index += 1) {
    const candidate = corePlaceSet(expansion.routes[index]);
    for (let otherIndex = index + 1; otherIndex < expansion.routes.length; otherIndex += 1) {
      const reference = corePlaceSet(expansion.routes[otherIndex]);
      const shared = sharedPlaceCount(candidate, reference);
      assert.ok(shared < 2 || (candidate.size - shared >= 2 && reference.size - shared >= 2), `${expansion.routes[index].id} duplicates ${expansion.routes[otherIndex].id}`);
    }
  }
  for (const route of expansion.routes) {
    const origin = route.meeting_primary_coordinates;
    assert.ok(origin && origin.lat >= 31.78 && origin.lat <= 32.12 && origin.lon >= 34.72 && origin.lon <= 34.83, route.id);
    assert.equal(route.full_map_points.length, route.full_map_coordinates.length, route.id);
    assert.ok(route.full_map_points.length >= 3 && route.full_map_points.length <= 10, route.id);
    assert.ok(route.sources.length > 0 && route.sources.every((url) => url.startsWith('https://')), route.id);
    assert.ok(route.navigation_coordinates.every((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lon)), route.id);
    assert.ok(route.stops.every((stop) => stop.sources.length > 0 && stop.story_long), route.id);
    const excludedStops = route.stops.filter((stop) => stop.navigation_excluded);
    if (expansion.pass_route_ids.includes(route.id)) assert.equal(excludedStops.length, 0, route.id);
    for (const stop of excludedStops) {
      assert.equal(stop.navigation_name, null, route.id);
      assert.ok(stop.navigation_exclusion_reason.length >= 20, route.id);
      assert.ok(!route.map_points.includes(stop.name), route.id);
      assert.ok(!route.full_map_points.includes(stop.name), route.id);
    }
    if (['loop', 'snake', 'out_and_back'].includes(route.route_pattern)) {
      assert.equal(route.full_map_points[0], route.full_map_points.at(-1), route.id);
    }
    if (['loop', 'snake'].includes(route.route_pattern)) {
      assert.ok(route.return_points.length > 0, route.id);
      assert.ok(route.return_roads, route.id);
      const outbound = new Set([route.meeting_primary, route.meeting_secondary, ...route.map_points]);
      assert.ok(route.return_points.some((point) => !outbound.has(point)), route.id);
    }
  }
});

test('תיקוני הנתונים והניווט הקריטיים נשמרים במפורש', () => {
  assert.equal(release.route_overrides.r028.level, 'קל');
  assert.equal(release.route_overrides.r028.start, 'ראשון לציון');
  assert.equal(release.route_overrides.r028.end, 'אשקלון');
  assert.equal(release.route_overrides.r056.end, 'מרכז פקיעין');
  assert.equal(release.route_overrides.r058.end, 'רמת ישי');
  assert.equal(release.route_overrides.c004.route_shape, 'מעגלי');
  assert.match(release.route_overrides.c001.roads, /(?:^|, )6(?:,|$)/);
  assert.equal(release.stop_navigation.r019['מצודת היערנים'], null);
  assert.equal(release.stop_navigation.r036['דרך נוף יער שווייץ'], 'חניון מול גולן, יער שווייץ');
  assert.doesNotMatch(release.route_overrides.r066.style, /כבושה/);
  assert.doesNotMatch(release.route_overrides.r066.road_character, /כבושה/);
  assert.ok(release.route_overrides.r066.trip_types.every((value) => !/כבושה/.test(value)));
  assert.deepEqual(
    [...release.navigation_points.c004],
    ['פז הסיירים', 'פז עד הלום', 'תל לכיש', 'ערד', 'נווה זוהר', 'ערד', 'פז הסיירים'],
  );
  assert.ok(release.stop_exclusions.r015.includes('בר בהר'));
  assert.ok(release.stop_exclusions.r023.includes('הר סדום – תצפית נגישה'));
  assert.equal(release.stop_navigation.r040['מאגר אשכול – תצפית מבחוץ'], null);
  assert.equal(release.meeting_overrides.c005.primary, 'דלק היובל, חולון');
  assert.ok(release.source_overrides.r052.some((url) => url.includes('yomkipurwar.mod.gov.il')));
  assert.ok(release.source_overrides.r052.some((url) => url.includes('parks.org.il/?p=4931')));
  assert.ok(release.source_overrides.r052.some((url) => url.includes('izkor.gov.il/monument/')));
  assert.ok(release.source_overrides.r052.every((url) => !url.includes('tourgolan.org.il')));
  assert.doesNotMatch(app, /routeId === 'r028'/);
  assert.match(app, /String\(index \+ 1\)\.padStart\(3, '0'\)/);
  assert.match(app, /point !== points\[index - 1\]/);
  assert.match(app, /stop\.navigation_name === null/);
});

test('דוח הביקורת מפרסם 180 מסלולים בשני טאבים ומשאיר רק מחקר לא גמור מוסתר', async () => {
  const report = await buildAudit();
  assert.equal(report.document_version, CATALOGUE_VERSION);
  assert.equal(report.summary.total_records, 233);
  assert.equal(report.summary.legacy_records, 180);
  assert.equal(report.summary.candidate_records, 53);
  assert.equal(report.summary.pass_catalogue, 90);
  assert.equal(report.summary.active_catalogue, 90);
  assert.equal(report.summary.warning_catalogue, 90);
  assert.equal(report.summary.published_catalogue, 180);
  assert.equal(report.summary.passed, 90);
  assert.equal(report.summary.warning, 90);
  assert.equal(Object.values(report.summary.warning_severity).reduce((sum, value) => sum + value, 0), 90);
  assert.equal(report.summary.research, 53);
  assert.equal(report.summary.reviewing, 0);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.published_static_failures, 0);
  assert.equal(report.summary.withheld, 0);
  assert.equal(report.routes.filter((route) => route.release_status === 'pass' && route.published_tab === 'main').length, 90);
  assert.equal(report.routes.filter((route) => route.release_status === 'warning' && route.published_tab === 'issues').length, 90);
  assert.equal(report.routes.filter((route) => route.release_status === 'research' && route.published_tab === null).length, 53);
  assert.ok(report.routes
    .filter((route) => route.release_status === 'warning')
    .every((route) => /^הבעיה שנמצאה:\s+/.test(route.release_reason)
      && ['minor_navigation', 'conditional', 'major'].includes(route.warning_severity)
      && route.warning_severity_label
      && route.warning_severity_explanation
      && !/^המסלול הוסר/.test(route.release_reason)
      && route.source_urls.length > 0));
  assert.ok(report.routes
    .filter((route) => route.release_status !== 'warning')
    .every((route) => route.warning_severity === null));
  assert.ok(report.summary.published_stops > 475);
  assert.ok(report.summary.published_stops > report.summary.active_stops);
  assert.ok(report.summary.unique_published_sources >= report.summary.unique_active_sources);
  assert.ok(report.summary.navigation_excluded_stops > 0);
});

test('דוחות 2.3.0 הכתובים כוללים בדיקת רשת מלאה ושומרים את דוחות 2.2.1–2.2.4', () => {
  const jsonPath = path.join(root, 'reports', 'route-release-audit-2.3.0.json');
  const markdownPath = path.join(root, 'reports', 'ROUTE_RELEASE_AUDIT_2_3_0.md');
  assert.ok(fs.existsSync(jsonPath));
  assert.ok(fs.existsSync(markdownPath));
  const written = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.equal(written.document_version, CATALOGUE_VERSION);
  assert.equal(written.network_checked, true);
  assert.equal(written.summary.published_catalogue, 180);
  assert.equal(written.summary.passed, 90);
  assert.equal(written.summary.warning, 90);
  assert.equal(written.summary.published_static_failures, 0);
  assert.equal(written.summary.published_source_failures, 0);
  assert.equal(written.summary.generic_redirect_sources, 0);
  assert.equal(written.summary.soft_404_sources, 0);
  assert.equal(Object.values(written.summary.warning_severity).reduce((sum, value) => sum + value, 0), 90);
  assert.equal(written.summary.research, 53);
  assert.ok(written.routes
    .filter((route) => route.release_status === 'warning')
    .every((route) => /^הבעיה שנמצאה:\s+/.test(route.release_reason)
      && !/^המסלול הוסר/.test(route.release_reason)));
  assert.ok(written.routes
    .filter((route) => route.published_tab)
    .every((route) => route.checks.sources_reachable === true));
  const markdown = fs.readFileSync(markdownPath, 'utf8');
  assert.match(markdown, /גרסה 2\.3\.0/);
  assert.match(markdown, /90 מסלולים ב־PASS/);
  assert.match(markdown, /90 מסלולים מפורסמים בטאב נפרד/);
  assert.match(markdown, /\| קטגוריית הערה \|/);
  assert.match(markdown, /## שלוש קטגוריות ההערה/);
  assert.match(markdown, /53 מועמדי מחקר לא גמורים נשארים מוסתרים/);
  assert.ok(fs.existsSync(path.join(root, 'reports', 'route-release-audit-2.2.1.json')));
  assert.ok(fs.existsSync(path.join(root, 'reports', 'ROUTE_RELEASE_AUDIT_2_2_1.md')));
  assert.ok(fs.existsSync(path.join(root, 'reports', 'route-release-audit-2.2.2.json')));
  assert.ok(fs.existsSync(path.join(root, 'reports', 'ROUTE_RELEASE_AUDIT_2_2_2.md')));
  assert.ok(fs.existsSync(path.join(root, 'reports', 'route-release-audit-2.2.3.json')));
  assert.ok(fs.existsSync(path.join(root, 'reports', 'ROUTE_RELEASE_AUDIT_2_2_3.md')));
  assert.ok(fs.existsSync(path.join(root, 'reports', 'route-release-audit-2.2.4.json')));
  assert.ok(fs.existsSync(path.join(root, 'reports', 'ROUTE_RELEASE_AUDIT_2_2_4.md')));
});

test('דוח הגאוגרפיה בודק את כל 90 המסלולים החדשים ואת ציר החזרה בפועל', () => {
  const jsonPath = path.join(root, 'reports', 'route-geography-audit-2.3.0.json');
  const markdownPath = path.join(root, 'reports', 'ROUTE_GEOGRAPHY_AUDIT_2_3_0.md');
  assert.ok(fs.existsSync(jsonPath));
  assert.ok(fs.existsSync(markdownPath));
  const written = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.equal(written.document_version, CATALOGUE_VERSION);
  assert.equal(written.product_version, CATALOGUE_VERSION);
  assert.equal(written.network_checked, true);
  assert.equal(written.summary.routes_checked, 90);
  assert.equal(written.summary.pass_routes_checked, 45);
  assert.equal(written.summary.warning_routes_checked, 45);
  assert.equal(written.summary.osrm_routeable, 90);
  assert.equal(written.summary.route_gate_failures, 0);
  assert.equal(written.summary.pass_gate_failures, 0);
  assert.equal(written.summary.different_return_corridor_passed, 90);
  assert.ok(written.routes.every((route) => route.route_gate === true));
  assert.ok(written.routes
    .filter((route) => ['loop', 'snake'].includes(route.route_pattern))
    .every((route) => route.checks.different_return_corridor === true
      && route.osrm.return_geometry_unique_percent >= 10));
  assert.match(fs.readFileSync(markdownPath, 'utf8'), /גרסת מסמך 2\.3\.0/);
});

test('שלושת תיקי המחקר נסגרו בדוחות QA אזוריים', () => {
  for (const name of ['NORTH_ROUTE_EXPANSION_QA_2_3_0.json', 'CENTRAL_EAST_ROUTE_EXPANSION_QA_2_3_0.json', 'SOUTH_ROUTE_EXPANSION_QA_2_3_0.json']) {
    const report = JSON.parse(read(`reports/research/${name}`));
    assert.equal(report.document_version, CATALOGUE_VERSION, name);
    assert.equal(report.product_version, CATALOGUE_VERSION, name);
    assert.equal(report.result, 'PASS', name);
    assert.equal(report.route_counts.total, 30, name);
    assert.equal(report.route_counts.pass, 15, name);
    assert.equal(report.route_counts.warning, 15, name);
  }
});

test('HTML מציג ממשק 2.4.0, קטלוג 2.3.0, טאב אזהרות, בטיחות וכל התצוגות', () => {
  assert.match(index, new RegExp(`גרסה ${APP_VERSION.replaceAll('.', '\\.')}`));
  assert.doesNotMatch(index, /גרסת מוצר|גרסת מסמך/);
  assert.match(index, /<meta name="robots" content="noindex,nofollow,noarchive,nosnippet">/);
  assert.match(index, new RegExp(`data/route-expansion-v${CATALOGUE_VERSION.replaceAll('.', '\\.')}\\.js`));
  assert.match(index, new RegExp(`data/release-audit-v${CATALOGUE_VERSION.replaceAll('.', '\\.')}\\.js`));
  assert.match(index, new RegExp(`data/config-v${APP_VERSION.replaceAll('.', '\\.')}\\.js`));
  assert.match(index, new RegExp(`assets/app-v${APP_VERSION.replaceAll('.', '\\.')}\\.js`));
  assert.match(index, new RegExp(`assets/app-v${APP_VERSION.replaceAll('.', '\\.')}\\.css`));
  assert.match(index, new RegExp(`manifest-${APP_VERSION.replaceAll('.', '\\.')}\\.webmanifest`));
  assert.match(index, /href="\.\/favicon\.ico"/);
  assert.doesNotMatch(index, /<iframe[^>]+book\.html/i);
  for (const view of ['routesView', 'issuesView', 'journeysView', 'safetyView', 'plannerView', 'combinedView', 'aboutView']) {
    assert.match(index, new RegExp(`id="${view}"`));
  }
  for (const control of ['tabIssues', 'issueTabCount', 'issueSearch', 'clearIssueSearch', 'issueResultSummary', 'openAllIssues', 'closeAllIssues', 'issueRouteGrid', 'issueEmptyState']) {
    assert.match(index, new RegExp(`id="${control}"`), control);
  }
  for (const control of [
    'issueSeverityFilters',
    'issueSeverityCountAll', 'issueSeverityCountMinor', 'issueSeverityCountConditional', 'issueSeverityCountMajor',
    'issueGuideCountMinor', 'issueGuideCountConditional', 'issueGuideCountMajor',
  ]) assert.match(index, new RegExp(`id="${control}"`), control);
  for (const severity of ['all', 'minor_navigation', 'conditional', 'major']) {
    assert.match(index, new RegExp(`data-issue-severity="${severity}"`), severity);
  }
  for (const label of ['תיקון ניווט קטן', 'מסלול מותנה', 'בעיה מהותית']) assert.match(index, new RegExp(label), label);
  assert.match(index, /90 מסלולים שעברו את שער השחרור/);
  assert.match(index, /יוצאים מהמרכז — בכוכב, בלולאה או ב״נחש״/);
  assert.match(index, /id="centralStar"/);
  assert.match(index, /המסלולים כאן לא קיבלו PASS, אבל הם לא נמחקו/);
  assert.match(index, /הבעיה המדויקת/);
  assert.match(index, /המפה או אחת מנקודות הניווט עלולות להיות חלק מהבעיה/);
  assert.match(index, /53 מועמדי מחקר[^<]*אינם מפורסמים/);
  for (const required of ['אסור לעבור או לעקוף אותו', 'המאסף משחרר אותם', 'אין עקיפה מימין בשום מקרה', 'אין להשתמש באתר בזמן רכיבה']) {
    assert.ok(index.includes(required), required);
  }
  assert.match(index, /טיול חברים קבוצתי ולא־מאורגן/);
  assert.match(index, /שירותי גרירה/);
  assert.doesNotMatch(index, /נבדקו רישיונות, ביטוח, מיגון וכשירות הכלים/);
  assert.doesNotMatch(index, /קיימים ערכת עזרה ראשונה ופרטי חירום/);
});

test('התכונות ששוחזרו נשארות פעילות בקוד', () => {
  for (const functionName of [
    'filterRoutes', 'renderJourneys', 'pointsMapsUrl', 'migrateLegacyStorage',
    'renderCombined', 'routeExportHtml', 'grandExportHtml', 'openInvite',
    'getMeetings', 'initVisitCounter', 'normalizeSprings', 'approachMapsUrl',
    'filterIssueRoutes', 'renderIssueRoutes', 'renderCentralStar', 'routeStarDirection',
    'writeClipboardText', 'copyWithFeedback', 'buildStopAiPrompt', 'copyStopAiPrompt',
  ]) assert.match(app, new RegExp(`function ${functionName}\\(`));

  for (const feature of ['data-export-route', 'data-add-combined', 'data-jump-route', 'data-invite', 'data-export-grand']) {
    assert.match(app, new RegExp(feature));
  }
  assert.match(app, /quickFilter === 'short'[\s\S]*?trip_types/);
  assert.match(app, /quickFilter === 'loop'[\s\S]*?route_pattern/);
  assert.match(app, /quickFilter === 'radial'[\s\S]*?route_pattern/);
  assert.match(app, /Number\(profile\.gravel\) > 0/);
  assert.match(app, /מפת גישה לנקודות המפגש/);
  assert.match(app, /מפת מסלול הטיול/);
  assert.match(app, /function fullRouteNavigationPoints\(/);
  assert.match(app, /route\.return_points/);
  assert.match(app, /route\.route_pattern/);
  assert.doesNotMatch(app, /mapsUrlWithMeetings/);
});

test('שמונת שיפורי 2.4.0 קיימים בממשק ומחוברים לאירועים ולנתונים', () => {
  const filters = appFunctionSection('filterRoutes', 'loadVisibleMaps');
  const card = appFunctionSection('routeCard', 'filterRoutes');
  const dayEstimate = appFunctionSection('routeDayEstimate', 'dateSortValue');
  const shareUrl = appFunctionSection('routeShareUrl', 'setRouteAddress');
  const picker = appFunctionSection('pickerCandidates', 'pickerRandomIndex');
  const mapDialog = appFunctionSection('openMap', 'closeMapDialog');
  const readyText = appFunctionSection('routeReadyText', 'openReadyShare');
  const readyDialog = appFunctionSection('openReadyShare', 'closeReadyShareDialog');
  const events = appFunctionSection('bindEvents', 'initPwa');
  const init = appFunctionSection('init', '');

  // 1. סינון ומיון מעשיים יותר.
  for (const control of ['directionFilter', 'patternFilter', 'dayLengthFilter', 'personalFilter', 'sortFilter']) {
    assert.match(index, new RegExp(`id="${control}"`), control);
  }
  for (const value of ['day-short', 'day-long', 'checked']) assert.match(index, new RegExp(`value="${value}"`), value);
  assert.match(filters, /routeStarDirection\(route\) === direction/);
  assert.match(filters, /routePattern === pattern/);
  assert.match(filters, /day\.band === dayLength/);
  assert.match(filters, /personal\.status === personalFilter/);
  assert.match(filters, /sort === 'day-short'/);
  assert.match(filters, /sort === 'day-long'/);
  assert.match(filters, /sort === 'checked'/);

  // 2. כרטיס ברור עם אומדן יום, מפגש ראשון, מועד בדיקה ואופי המסלול.
  assert.match(dayEstimate, /hasAuditedFullDistance/);
  assert.match(dayEstimate, /estimatedApproachKm/);
  assert.match(dayEstimate, /אומדן מנקודת המרכז הקבועה/);
  assert.match(card, /class="day-facts"/);
  for (const label of ['יום מהמרכז', 'משך יום משוער', 'מפגש ראשון', 'בדיקה אחרונה', 'ליבת הטיול']) assert.match(card, new RegExp(label), label);
  assert.match(card, /routePatternLabel\(route\)/);

  // 3. קטגוריות מומלצות מהירות.
  for (const preset of ['half', 'full', 'long-day', 'twisty', 'calm', 'north', 'south', 'east', 'center']) {
    assert.match(index, new RegExp(`data-quick="${preset}"`), preset);
    assert.match(filters, new RegExp(`quickFilter === '${preset}'|Object\\.hasOwn\\(STAR_DIRECTIONS, quickFilter\\)`), preset);
  }
  assert.match(events, /#quickFilters/);
  assert.match(events, /button\.dataset\.quick/);

  // 4. קישור ישיר לכל מסלול, כולל פתיחה מכתובת והסרת הפרמטר בסגירה.
  assert.match(shareUrl, /searchParams\.set\('route', route\.id\)/);
  assert.match(shareUrl, /issuesView|routesView/);
  assert.match(card, /data-copy-route-link/);
  assert.match(events, /data-copy-route-link/);
  assert.match(events, /routeShareUrl\(route\)/);
  assert.match(appFunctionSection('requestedRouteFromAddress', 'openPendingInitialRoute'), /searchParams\.get\('route'\)/);
  assert.match(init, /requestedRouteFromAddress\(\)/);
  assert.match(appFunctionSection('closeRouteDialog', 'closeDialog'), /clearRouteAddress\(\)/);

  // 5. תכנון אישי מקומי: רוצה לרכוב, רכבתי והערה אישית.
  assert.equal(config.personalRoutesKey, 'ilan-road-book-v2-personal-routes');
  for (const functionName of ['getPersonalRoutes', 'personalRoute', 'storePersonalRoute', 'togglePersonalStatus', 'savePersonalDetails']) {
    assert.match(app, new RegExp(`function ${functionName}\\(`), functionName);
  }
  assert.match(appFunctionSection('getPersonalRoutes', 'personalRoute'), /config\.personalRoutesKey/);
  assert.match(card, /data-personal-status="want"/);
  assert.match(card, /data-personal-status="ridden"/);
  assert.match(appFunctionSection('openRoute', 'resolveInviteTarget'), /id="personalNote"/);
  assert.match(events, /data-personal-route/);
  assert.match(events, /data-save-personal/);

  // 6. מפה מוגדלת עם קישור ל-Google Maps וסגירה שמפנה את ה-iframe.
  for (const control of ['mapDialog', 'mapDialogTitle', 'largeMapFrame', 'largeMapGoogle']) assert.match(index, new RegExp(`id="${control}"`), control);
  assert.match(card, /data-enlarge-map/);
  assert.match(mapDialog, /largeMapFrame/);
  assert.match(mapDialog, /largeMapGoogle/);
  assert.match(appFunctionSection('closeMapDialog', 'routeReadyText'), /removeAttribute\('src'\)/);
  assert.match(events, /data-enlarge-map/);

  // 7. "בחר לי טיול" מסנן רק את מערך ה-PASS ומציע תוצאה אקראית.
  for (const control of ['openPicker', 'pickerDialog', 'pickerForm', 'pickerDay', 'pickerDirection', 'pickerStyle', 'pickerResult']) {
    assert.match(index, new RegExp(`id="${control}"`), control);
  }
  assert.match(picker, /return routes\.filter/);
  assert.doesNotMatch(picker, /issueRoutes|actionRoutes/);
  assert.match(appFunctionSection('suggestRoute', 'openPicker'), /pickerRandomIndex/);
  assert.match(events, /#openPicker/);
  assert.match(events, /#pickerForm/);

  // 8. תצוגת "מוכן להפצה" מרכזת פרטים, אזהרה, קישור, מפה, WhatsApp וייצוא HTML.
  for (const control of ['readyShareDialog', 'readySharePreview', 'copyReadyShare', 'openReadyWhatsapp', 'copyReadyLink', 'readyShareMap', 'exportReadyRoute']) {
    assert.match(index, new RegExp(`id="${control}"`), control);
  }
  assert.match(readyText, /route\.release_issue_reason/);
  assert.match(readyText, /route\.release_issue_severity_label/);
  assert.match(readyText, /routeShareUrl\(route\)/);
  assert.match(readyText, /mapsUrl\(route\)/);
  assert.match(readyText, /כל רוכב רוכב באחריותו הבלעדית/);
  assert.match(readyDialog, /readySharePreview/);
  assert.match(readyDialog, /readyShareMap/);
  assert.match(events, /#copyReadyShare/);
  assert.match(events, /https:\/\/wa\.me/);
  assert.match(events, /#copyReadyLink/);
  assert.match(events, /#exportReadyRoute/);
});

test('הערת ה־warning המדויקת נשמרת בכרטיס, בפרטים, בהזמנה, בשילוב ובייצוא', () => {
  const card = appFunctionSection('routeCard', 'filterRoutes');
  const combined = appFunctionSection('combinedPlanText', 'renderCombined');
  const routeExport = appFunctionSection('routeExportHtml', 'exportRoute');
  const detail = appFunctionSection('openRoute', 'resolveInviteTarget');
  const inviteOptions = appFunctionSection('ensureInviteOptions', 'writeMeetingsToForm');
  const invitePreview = appFunctionSection('updateInvitePreview', 'loadInviteTarget');
  const switching = appFunctionSection('switchView', 'clearFilters');
  const events = appFunctionSection('bindEvents', 'initPwa');

  assert.match(card, /route-issue-warning/);
  assert.match(card, /route\.release_issue_reason/);
  assert.match(card, /route\.release_issue_severity/);
  assert.match(card, /severity\.label/);
  assert.match(combined, /route\.release_issue_reason/);
  assert.match(combined, /route\.release_issue_severity_label/);
  assert.match(routeExport, /route\.release_issue_reason/);
  assert.match(routeExport, /route\.release_issue_severity_label/);
  assert.match(detail, /route\.release_issue_reason/);
  assert.match(detail, /route\.release_issue_severity_label/);
  assert.match(inviteOptions, /issueRoutes/);
  assert.match(invitePreview, /route\.release_issue_reason/);
  assert.match(invitePreview, /route\.release_issue_severity_label/);
  assert.match(switching, /issuesView[\s\S]*renderIssueRoutes/);
  assert.match(events, /issueSearch/);
  assert.match(events, /openAllIssues/);
  assert.match(events, /closeAllIssues/);
  assert.match(events, /issueSeverityFilters/);
  assert.match(events, /button\.dataset\.issueSeverity/);
  assert.match(appFunctionSection('filterIssueRoutes', 'renderIssueRoutes'), /route\.release_issue_severity === issueSeverityFilter/);
  assert.match(appFunctionSection('renderIssueRoutes', 'combinedPlanText'), /issueSeverityCountAll|issueSeverityFilter/);
  assert.match(app, /config\.issueConsentsKey/);
  assert.match(app, /if \(route\.release_has_issue\) consents\.add\(routeId\)/);
  assert.match(card, /הוספה לשילוב למרות ההערה/);
  assert.doesNotMatch(app, /window\.confirm/);
});

test('כל תחנה מאפשרת להעתיק פרומפט עשיר ל־AI בלי להציג אותו', () => {
  const detail = appFunctionSection('openRoute', 'resolveInviteTarget');
  const prompt = appFunctionSection('buildStopAiPrompt', 'copyStopAiPrompt');
  const copyAction = appFunctionSection('copyStopAiPrompt', 'openAi');
  const events = appFunctionSection('bindEvents', 'initPwa');
  const clipboard = appFunctionSection('writeClipboardText', 'copyWithFeedback');

  assert.match(detail, /data-copy-stop-ai="\$\{escapeHtml\(route\.id\)\}"/);
  assert.match(detail, /data-copy-stop-ai[\s\S]*?העתקה ל־AI[\s\S]*?\$\{releaseIssue \? '' : `<button[^`]+data-ai-route/);
  assert.match(detail, /title="\$\{escapeHtml\(AI_COPY_TOOLTIP\)\}"/);
  const tooltip = app.match(/const AI_COPY_TOOLTIP\s*=\s*'([^']+)'/)?.[1] || '';
  const successHelp = app.match(/const AI_COPY_SUCCESS_HELP\s*=\s*'([^']+)'/)?.[1] || '';
  for (const instruction of [tooltip, successHelp]) {
    assert.match(instruction, /לוח/);
    assert.match(instruction, /AI/);
    assert.match(instruction, /Paste|הדבקה/);
  }
  assert.match(index, /id="copyStatus"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(prompt, /stop\.name/);
  assert.match(prompt, /stop\.navigation_name === null/);
  assert.match(prompt, /stop\.story_long/);
  assert.match(prompt, /stop\.spring/);
  assert.match(prompt, /route\.release_issue_reason/);
  assert.match(prompt, /route\.sources/);
  assert.match(prompt, /מקורות כלליים של המסלול/);
  assert.match(prompt, /אינם בהכרח משויכים ישירות לנקודה/);
  assert.match(prompt, /אל תמציא עובדות/);
  assert.match(prompt, /5 שאלות המשך/);
  assert.match(copyAction, /copyWithFeedback\(\s*button,\s*buildStopAiPrompt\(route, stop\)/);
  assert.match(copyAction, /הועתק[^'\n]*(?:להדביק|הדבקה)[^'\n]*AI/);
  assert.match(copyAction, /AI_COPY_SUCCESS_HELP/);
  assert.doesNotMatch(copyAction, /showModal|innerHTML|openAi/);
  assert.match(events, /data-copy-stop-ai/);
  assert.match(clipboard, /navigator\.clipboard\?\.writeText/);
  assert.match(clipboard, /document\.execCommand\?\.\('copy'\)/);
  assert.match(clipboard, /try \{[\s\S]*?field\.setSelectionRange[\s\S]*?\} finally \{[\s\S]*?field\.remove\(\)/);
  const feedback = appFunctionSection('copyWithFeedback', 'getCombined');
  assert.match(feedback, /aria-busy/);
  assert.match(feedback, /copyStatus/);
  assert.match(feedback, /button\.(?:setAttribute|getAttribute)\('title'/);
  assert.doesNotMatch(feedback, /button\.disabled/);
});

test('כרטיסים ומסכי מובייל אינם יכולים לחרוג מרוחב המסך', () => {
  assert.match(css, /\.route-grid \{[^}]*min-inline-size: 0;/);
  assert.match(css, /\.route-card \{[^}]*min-inline-size: 0;[^}]*max-inline-size: 100%;/);
  assert.match(css, /\.route-card-main \{[^}]*min-inline-size: 0;/);
  assert.match(css, /\.route-card-top > div \{[^}]*min-inline-size: 0;/);
  assert.match(css, /\.route-inline-details \{[^}]*min-inline-size: 0;[^}]*max-inline-size: 100%;/);
  assert.match(css, /\.route-strip \{[^}]*inline-size: 100%;[^}]*min-inline-size: 0;[^}]*max-inline-size: 100%;[^}]*overflow-x: auto;/);
  assert.match(css, /@media \(max-width: 1180px\)[\s\S]*?\.route-card \{[^}]*grid-template-columns: minmax\(0,1fr\);[^}]*\}/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.route-grid \{[^}]*grid-template-columns: minmax\(0,1fr\);[^}]*\}/);
  assert.match(css, /\.route-card h3 \{[^}]*overflow-wrap: anywhere;/);
  assert.match(css, /\.combined-preview \{[^}]*max-inline-size: 100%;[^}]*white-space: pre-wrap;[^}]*overflow-wrap: anywhere;[^}]*word-break: break-word;/);
  for (const warningClass of ['issue-route-card', 'route-issue-warning', 'issues-intro', 'issue-search-panel', 'combined-item-warning']) {
    assert.match(css, new RegExp(`\\.${warningClass}\\b`), warningClass);
  }
  for (const severity of ['minor_navigation', 'conditional', 'major']) {
    assert.match(css, new RegExp(`\\.issue-severity-${severity}\\b`), severity);
  }
  assert.match(css, /\.issue-severity-guide \{[^}]*grid-template-columns:/);
  assert.match(css, /\.issue-severity-filters \{[^}]*grid-template-columns:/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.issue-severity-guide, \.issue-severity-filters \{ grid-template-columns: minmax\(0,1fr\); \}/);
});

test('manifest, נכסי UI ו-Service Worker יחסיים ומסונכרנים ל-2.4.0 בלי לשנות את קטלוג 2.3.0', () => {
  assert.equal(config.version, APP_VERSION);
  assert.equal(release.version, CATALOGUE_VERSION);
  assert.equal(expansion.version, CATALOGUE_VERSION);
  assert.equal(manifest.version, APP_VERSION);
  assert.match(manifest.name, /גרסה 2\.4\.0/);
  assert.match(manifest.short_name, /2\.4\.0/);
  assert.equal(manifest.start_url, './?source=pwa');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.src.startsWith('./')));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.src.startsWith('./')));
  assert.ok(manifest.shortcuts.some((shortcut) => shortcut.url === './#issuesView'));
  assert.match(serviceWorker, /const CACHE_PREFIX = 'ilan-roadbook-live-'/);
  assert.match(serviceWorker, /const CACHE_NAME = `\$\{CACHE_PREFIX\}v2\.4\.0-build-1`/);
  assert.match(serviceWorker, /data\/route-expansion-v2\.3\.0\.js/);
  assert.match(serviceWorker, /data\/release-audit-v2\.3\.0\.js/);
  assert.match(serviceWorker, /data\/config-v2\.4\.0\.js/);
  assert.match(serviceWorker, /assets\/app-v2\.4\.0\.js/);
  assert.match(serviceWorker, /assets\/app-v2\.4\.0\.css/);
  assert.match(serviceWorker, /manifest-2\.4\.0\.webmanifest/);
  assert.match(serviceWorker, /offline-2\.4\.0\.html/);
  assert.match(serviceWorker, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME/);
  assert.doesNotMatch(serviceWorker, /maps\.google|api\/v2\/ask|api\/v2\/speech/);
});

test('robots, מעטפת offline וקובצי הפרסום שלמים', () => {
  assert.equal(read('robots.txt').replace(/\r\n/g, '\n').trim(), 'User-agent: *\nDisallow: /');
  assert.match(read(`offline-${APP_VERSION}.html`), /גרסה 2\.4\.0/);
  for (const relative of [
    'index.html', `offline-${APP_VERSION}.html`, `manifest-${APP_VERSION}.webmanifest`, 'sw.js',
    `assets/app-v${APP_VERSION}.css`, `assets/app-v${APP_VERSION}.js`, `data/config-v${APP_VERSION}.js`,
    'data/legacy-content-v2.js', 'data/new-routes-v2.js', 'data/route-expansion-v2.3.0.js', 'data/release-audit-v2.3.0.js',
    'icons/icon-192.png', 'icons/icon-512.png', 'favicon.ico',
  ]) assert.ok(fs.existsSync(path.join(root, relative)), relative);
  for (const [compatibility, active] of [
    ['assets/app-v2.js', `assets/app-v${APP_VERSION}.js`],
    ['assets/app-v2.css', `assets/app-v${APP_VERSION}.css`],
    ['data/config-v2.js', `data/config-v${APP_VERSION}.js`],
    ['data/release-audit-v2.js', 'data/release-audit-v2.3.0.js'],
    ['manifest.webmanifest', `manifest-${APP_VERSION}.webmanifest`],
    ['offline.html', `offline-${APP_VERSION}.html`],
  ]) assert.equal(read(compatibility), read(active), `${compatibility} != ${active}`);
});

test('מסמכי החובה מציגים גרסת מסמך ומוצר 2.4.0', () => {
  for (const relative of [
    'README_HE.md',
    'PROJECT_STATUS.md',
    'DECISIONS.md',
    'REVIEW_PACKET.md',
    'NEXT_ACTION.md',
    'RELEASE_2_4_0.md',
  ]) {
    assert.ok(fs.existsSync(path.join(root, relative)), relative);
    const document = read(relative);
    assert.match(document, /גרסת מסמך(?:[: ]+)(?:\*\*)?2\.4\.0/, `${relative}: גרסת מסמך`);
    assert.match(document, /גרסת מוצר(?:[: ]+)(?:\*\*)?2\.4\.0/, `${relative}: גרסת מוצר`);
  }
});

test('אין מפתח OpenAI בקובצי הפרויקט הניתנים לפרסום', () => {
  const queue = [root];
  while (queue.length) {
    const current = queue.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.git' || (entry.isDirectory() && entry.name === 'versions')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else if (/\.(?:html|js|mjs|json|md|toml|txt|css|webmanifest)$/i.test(entry.name)) {
        assert.doesNotMatch(fs.readFileSync(full, 'utf8'), /sk-[A-Za-z0-9_-]{16,}/, full);
      }
    }
  }
});
