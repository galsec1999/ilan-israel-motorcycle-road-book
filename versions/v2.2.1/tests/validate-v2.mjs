/**
 * שער האיכות המקומי
 * גרסה: 2.2.1
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

function evaluateAll() {
  const context = vm.createContext({ window: {} });
  for (const relative of [
    'data/config-v2.js',
    'data/legacy-content-v2.js',
    'data/new-routes-v2.js',
    'data/release-audit-v2.js',
  ]) vm.runInContext(read(relative), context, { filename: relative });
  return context.window;
}

const data = evaluateAll();
const legacy = data.ROAD_BOOK_LEGACY;
const additions = data;
const config = data.ROAD_BOOK_CONFIG;
const release = data.ROAD_BOOK_RELEASE_AUDIT;
const manifest = JSON.parse(read('manifest.webmanifest'));
const index = read('index.html');
const app = read('assets/app-v2.js');
const css = read('assets/app-v2.css');
const serviceWorker = read('sw.js');

test('גרסה 2.2.1 משמרת את כל חומר המקור ואת צילום 2.2.0', () => {
  assert.equal(legacy.routes.length, 90);
  assert.equal(legacy.multiday.length, 18);
  assert.equal(legacy.grandTours.length, 3);
  assert.equal(new Set(legacy.routes.map((route) => route.id)).size, 90);
  assert.equal(additions.ROAD_BOOK_V2_CANDIDATES.length, 53);
  assert.equal(new Set(additions.ROAD_BOOK_V2_CANDIDATES.map((route) => route.id)).size, 53);
  assert.ok(fs.existsSync(path.join(root, 'versions', 'v2.2.0', 'index.html')));

  const known = new Set(legacy.routes.map((route) => route.id));
  for (const route of legacy.routes) {
    for (const connection of route.connections || []) {
      assert.ok(known.has(connection), `${route.id} -> ${connection}`);
    }
  }
});

test('שכבת השחרור היא רשימת היתר מפורשת ואינה מפרסמת מועמדים', () => {
  assert.equal(release.version, '2.2.1');
  assert.equal(release.publish_candidates, false);
  assert.equal(release.release_ready_route_ids.length, 45);
  assert.equal(release.withheld_legacy_route_ids.length, 45);
  assert.equal(new Set(release.release_ready_route_ids).size, release.release_ready_route_ids.length);
  assert.equal(new Set(release.withheld_legacy_route_ids).size, release.withheld_legacy_route_ids.length);
  assert.equal(release.release_ready_route_ids.filter((id) => release.withheld_legacy_route_ids.includes(id)).length, 0);
  const exclusions = new Set(release.catalogue_exclusions.filter((item) => item.route_id).map((item) => item.route_id));
  for (const id of release.withheld_legacy_route_ids) assert.ok(exclusions.has(id), id);

  const sourceIds = new Set(legacy.routes.map((route) => route.id));
  assert.ok(release.release_ready_route_ids.every((id) => sourceIds.has(id)));
  assert.ok(release.withheld_legacy_route_ids.every((id) => sourceIds.has(id)));
  assert.deepEqual(new Set(Object.keys(release.route_results)), sourceIds);
  for (const route of legacy.routes) {
    const result = release.route_results[route.id];
    assert.ok(result, route.id);
    assert.ok(['pass', 'withheld'].includes(result.status), route.id);
    if (result.status === 'pass') {
      assert.ok(Object.values(result.checks).every((value) => value === true), route.id);
    } else {
      assert.ok(release.withheld_legacy_route_ids.includes(route.id), route.id);
      assert.ok(result.reason, route.id);
    }
  }
  assert.match(app, /releaseAudit\.route_results/);
  assert.match(app, /release_audit_status/);
  assert.doesNotMatch(app, /release_audit_status:\s*'עבר ביקורת שחרור טכנית'/);
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
  assert.doesNotMatch(app, /routeId === 'r028'/);
  assert.match(app, /point !== points\[index - 1\]/);
  assert.match(app, /stop\.navigation_name === null/);
});

test('כל המסלולים הפעילים עוברים את שער הנתונים הסטטי', async () => {
  const report = await buildAudit();
  const expectedActive = legacy.routes.length - release.withheld_legacy_route_ids.length;
  assert.equal(report.summary.total_records, 143);
  assert.equal(report.summary.legacy_records, 90);
  assert.equal(report.summary.candidate_records, 53);
  assert.equal(report.summary.active_catalogue, expectedActive);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.withheld, 53 + release.withheld_legacy_route_ids.length);
});

test('HTML מציג גרסה אחת, בטיחות וכל התצוגות', () => {
  assert.match(index, /גרסה 2\.2\.1/);
  assert.doesNotMatch(index, /גרסת מוצר|גרסת מסמך/);
  assert.match(index, /<meta name="robots" content="noindex,nofollow,noarchive,nosnippet">/);
  assert.match(index, /data\/release-audit-v2\.js/);
  assert.doesNotMatch(index, /<iframe[^>]+book\.html/i);
  for (const view of ['routesView', 'journeysView', 'safetyView', 'plannerView', 'combinedView', 'aboutView']) {
    assert.match(index, new RegExp(`id="${view}"`));
  }
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
  ]) assert.match(app, new RegExp(`function ${functionName}\\(`));

  for (const feature of ['data-export-route', 'data-add-combined', 'data-jump-route', 'data-invite', 'data-export-grand']) {
    assert.match(app, new RegExp(feature));
  }
  assert.match(app, /quickFilter === 'short'[\s\S]*?trip_types/);
  assert.match(app, /Number\(profile\.gravel\) > 0/);
  assert.match(app, /מפת גישה לנקודות המפגש/);
  assert.match(app, /מפת מסלול הטיול/);
  assert.doesNotMatch(app, /mapsUrlWithMeetings/);
});

test('כרטיסים ומסכי מובייל אינם יכולים לחרוג מרוחב המסך', () => {
  assert.match(css, /\.route-grid \{ min-inline-size: 0;/);
  assert.match(css, /\.route-card \{ min-inline-size: 0; max-inline-size: 100%;/);
  assert.match(css, /\.route-card-main \{ min-inline-size: 0;/);
  assert.match(css, /\.route-card-top > div \{ min-inline-size: 0;/);
  assert.match(css, /\.route-inline-details \{ min-inline-size: 0; max-inline-size: 100%;/);
  assert.match(css, /\.route-strip \{[^}]*inline-size: 100%;[^}]*min-inline-size: 0;[^}]*max-inline-size: 100%;[^}]*overflow-x: auto;/);
  assert.match(css, /@media \(max-width: 1180px\)[\s\S]*?\.route-card \{ grid-template-columns: minmax\(0,1fr\); \}/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.route-grid \{ grid-template-columns: minmax\(0,1fr\); \}/);
  assert.match(css, /\.route-card h3 \{[^}]*overflow-wrap: anywhere;/);
  assert.match(css, /\.combined-preview \{[^}]*max-inline-size: 100%;[^}]*white-space: pre-wrap;[^}]*overflow-wrap: anywhere;[^}]*word-break: break-word;/);
});

test('manifest ו-Service Worker יחסיים, מתקינים ומסונכרנים לגרסה', () => {
  assert.equal(config.version, '2.2.1');
  assert.equal(manifest.version, '2.2.1');
  assert.match(manifest.name, /גרסה 2\.2\.1/);
  assert.match(manifest.short_name, /2\.2\.1/);
  assert.equal(manifest.start_url, './?source=pwa');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.src.startsWith('./')));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.src.startsWith('./')));
  assert.match(serviceWorker, /v2\.2\.1/);
  assert.match(serviceWorker, /data\/release-audit-v2\.js/);
  assert.match(serviceWorker, /CACHE_PREFIX\s*=\s*['"]ilan-road-book-['"]/);
  assert.match(serviceWorker, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(serviceWorker, /keys\.filter\(\(key\) => key !== CACHE_NAME\)/);
  assert.doesNotMatch(serviceWorker, /maps\.google|api\/v2\/ask|api\/v2\/speech/);
});

test('robots, מעטפת offline וקובצי הפרסום שלמים', () => {
  assert.equal(read('robots.txt').replace(/\r\n/g, '\n').trim(), 'User-agent: *\nDisallow: /');
  assert.match(read('offline.html'), /גרסה 2\.2\.1/);
  for (const relative of [
    'index.html', 'offline.html', 'manifest.webmanifest', 'sw.js',
    'assets/app-v2.css', 'assets/app-v2.js', 'data/config-v2.js',
    'data/legacy-content-v2.js', 'data/new-routes-v2.js', 'data/release-audit-v2.js',
    'icons/icon-192.png', 'icons/icon-512.png',
  ]) assert.ok(fs.existsSync(path.join(root, relative)), relative);
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
