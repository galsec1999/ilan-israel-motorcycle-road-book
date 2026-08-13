/**
 * שער האיכות המקומי
 * גרסת מסמך: 4.4.1
 * גרסת מוצר: 4.4.1
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function evaluate(relative, seed = {}) {
  const context = vm.createContext({ window: { ...seed } });
  vm.runInContext(read(relative), context, { filename: relative });
  return context.window;
}

const legacy = evaluate('data/legacy-content-v2.js').ROAD_BOOK_LEGACY;
const additions = evaluate('data/new-routes-v2.js');
const expanded = evaluate('data/expanded-catalog-v3.js').ROAD_BOOK_V3_EXPANDED;
const config = evaluate('data/config-v2.js').ROAD_BOOK_CONFIG;
const { ROUTE_CONTEXT: routeContext } = await import('../api-worker/src/context.generated.js');
const manifest = JSON.parse(read('manifest.webmanifest'));
const index = read('index.html');
const app = read('assets/app-v2.js');
const css = read('assets/app-v2.css');
const serviceWorker = read('sw.js');

test('V2 preserves the complete V1 catalogue and journeys', () => {
  assert.equal(legacy.routes.length, 90);
  assert.equal(legacy.multiday.length, 18);
  assert.equal(legacy.grandTours.length, 3);
  assert.equal(new Set(legacy.routes.map((route) => route.id)).size, 90);

  const known = new Set(legacy.routes.map((route) => route.id));
  for (const route of legacy.routes) {
    for (const connection of route.connections || []) assert.ok(known.has(connection), `${route.id} -> ${connection}`);
  }
});

test('V2 adds exactly 53 transparent research candidates', () => {
  const candidates = additions.ROAD_BOOK_V2_CANDIDATES;
  assert.equal(candidates.length, 53);
  assert.equal(additions.ROAD_BOOK_V2_VARIANTS.length, 0);
  assert.equal(new Set(candidates.map((route) => route.id)).size, 53);
  assert.equal(legacy.routes.length + candidates.length, 143);
  for (const route of candidates) {
    assert.ok(route.title);
    assert.ok(route.region);
    assert.ok(route.points.length >= 3, route.id);
    assert.ok(route.sources.length >= 1, route.id);
    assert.ok(route.sources.every((url) => /^https:\/\//.test(url)), route.id);
    assert.match(route.grade, /^[AB]$/);
  }
});

test('closed or blocked corridors remain excluded', () => {
  assert.equal(additions.ROAD_BOOK_V2_EXCLUDED.length, 3);
  assert.deepEqual(
    [...additions.ROAD_BOOK_V2_EXCLUDED.map((item) => item.name)].sort(),
    ['דרך נוף הרי נפתלי', 'יער חניתה', 'סוסיתא דרך אמפי גולן'].sort(),
  );
  assert.ok(additions.ROAD_BOOK_V2_EXCLUDED.every((item) => /^https:\/\//.test(item.source)));
});

test('HTML exposes one version, safety and all views', () => {
  assert.match(index, /גרסה 4\.4\.1/);
  assert.match(index, /id="aboutPassCount"/);
  assert.match(index, /id="aboutIssueCount"/);
  assert.doesNotMatch(index, /גרסת מוצר|גרסת מסמך/);
  assert.match(index, /<meta name="robots" content="noindex,nofollow,noarchive,nosnippet">/);
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

test('filter, map, speech, route assistant and legacy migration code is present', () => {
  for (const functionName of ['filterRoutes', 'renderJourneys', 'pointsMapsUrl', 'openAi', 'localGroundedAnswer', 'migrateLegacyStorage', 'renderCombined', 'routeExportHtml', 'grandExportHtml', 'openInvite', 'getMeetings', 'initVisitCounter']) {
    assert.match(app, new RegExp(`function ${functionName}\\(`));
  }
  assert.match(app, /window\.speechSynthesis/);
  assert.match(app, /roadTripCombinedV02/);
  assert.match(app, /function normalizeSprings\(/);
  for (const feature of ['data-export-route', 'data-add-combined', 'data-jump-route', 'data-invite', 'data-export-grand']) assert.match(app, new RegExp(feature));
  for (const control of ['typeFilter', 'durationFilter', 'themeFilter', "quickFilter === 'food'", "sort === 'quality'", "sort === 'long'"]) assert.ok(app.includes(control), control);
});

test('route assistant is named honestly and has all route dossiers', () => {
  assert.equal(Object.keys(routeContext).length, 143);
  assert.equal(Object.values(routeContext).reduce((sum, route) => sum + route.stops.length, 0), 659);
  assert.match(index, /עוזר המסלול/);
  assert.match(manifest.description, /עוזר המסלול/);
  assert.match(index, /העתקה ל־AI/);
  assert.doesNotMatch(app, />שאל AI</);
  assert.match(app, /assistant_ready/);
  assert.match(app, /candidate_scope/);
  assert.equal(config.aiEndpoint, '');
  assert.equal(config.allowCloudAi, false);
});

test('mobile route cards cannot grow past the viewport', () => {
  assert.match(css, /\.route-grid \{ min-inline-size: 0;/);
  assert.match(css, /\.route-card \{ min-inline-size: 0; max-inline-size: 100%;/);
  assert.match(css, /\.route-card-main \{[^}]*min-inline-size: 0;/);
  assert.match(css, /\.route-card-top > div \{ min-inline-size: 0;/);
  assert.match(css, /\.route-inline-details \{[^}]*min-inline-size: 0;[^}]*max-inline-size: 100%;/);
  assert.match(css, /\.route-strip \{[^}]*inline-size: 100%;[^}]*min-inline-size: 0;[^}]*max-inline-size: 100%;[^}]*overflow-x: auto;/);
  assert.ok(css.includes('@media (max-width: 1180px)'));
  assert.ok(css.includes('.route-card { grid-template-columns: minmax(0,1fr); grid-template-areas: "map" "main" "details"; }'));
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.route-grid \{ grid-template-columns: minmax\(0,1fr\); \}/);
  assert.match(css, /\.route-card h3 \{[^}]*overflow-wrap: anywhere;/);
});

test('all restored V1 data remains available to the V2 interface', () => {
  assert.equal(legacy.routes.reduce((sum, route) => sum + route.stops.length, 0), 477);
  assert.equal(legacy.routes.reduce((sum, route) => sum + route.connections.length, 0), 234);
  assert.equal(legacy.routes.reduce((sum, route) => sum + route.food_options.length, 0), 182);
  assert.equal(legacy.routes.reduce((sum, route) => sum + route.springs.length, 0), 34);
  assert.equal(legacy.routes.reduce((sum, route) => sum + route.stops.filter((stop) => stop.fuel).length, 0), 89);
  assert.equal(legacy.routes.reduce((sum, route) => sum + route.quality_checks.length, 0), 630);
});

test('manifest is relative, installable and versioned', () => {
  assert.equal(manifest.version, '4.4.1');
  assert.equal('document_version' in manifest, false);
  assert.equal(manifest.start_url, './?source=pwa');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.src.startsWith('./')));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.src.startsWith('./')));
});

test('service worker is versioned for this release', () => {
  assert.match(serviceWorker, /CACHE_PREFIX\s*=\s*['"]ilan-roadbook-v441-['"]/);
  assert.match(serviceWorker, /CACHE_NAME\s*=\s*`\$\{CACHE_PREFIX\}build-4`/);
  assert.match(serviceWorker, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(index, /getRegistrations\(\).*unregister/s);
  assert.doesNotMatch(serviceWorker, /maps\.google|api\/v2\/ask|api\/v2\/speech/);
});

test('robots and offline shell are ready for an unlisted deployment', () => {
  assert.equal(read('robots.txt').replace(/\r\n/g, '\n').trim(), 'User-agent: *\nDisallow: /');
  assert.match(read('offline.html'), /גרסה 4\.4\.1/);
  for (const relative of [
    'index.html', 'offline.html', 'manifest.webmanifest', 'sw.js',
    'assets/app-v2.css', 'assets/app-v2.js', 'data/config-v2.js',
    'data/legacy-content-v2.js', 'data/new-routes-v2.js',
    'icons/icon-192.png', 'icons/icon-512.png',
  ]) assert.ok(fs.existsSync(path.join(root, relative)), relative);
});

test('all 361 catalogue records produce at least two navigation points', () => {
  assert.equal(expanded.routes.length, 361);
  const navigationPoints = (route) => {
    if (route.map_points?.filter(Boolean).length >= 2) return route.map_points.filter(Boolean);
    if (route.waypoints?.filter(Boolean).length >= 2) return route.waypoints.filter(Boolean);
    return [
      route.start,
      ...(route.stops || []).map((stop) => stop.navigation_name === null ? '' : (stop.navigation_name || stop.name)),
      route.end,
    ].filter(Boolean);
  };
  const broken = expanded.routes.filter((route) => navigationPoints(route).length < 2);
  assert.equal(broken.length, 0, broken.map((route) => route.id).join(', '));
  assert.match(app, /const legacyWaypoints =/);
  assert.match(app, /summary: route\.summary \|\| route\.description/);
  assert.doesNotMatch(app, /routeById\.set\(synthId, synthRoute\);\s*routes\.push\(synthRoute\)/);
});

test('single-link Google Maps loops are split into outbound and return legs', () => {
  const sameEndpointLoops = expanded.routes.filter((route) => {
    if (!route.full_maps_url) return false;
    const url = new URL(route.full_maps_url);
    const origin = url.searchParams.get('origin');
    const destination = url.searchParams.get('destination');
    return Boolean(origin && destination && origin === destination);
  });
  assert.equal(sameEndpointLoops.length, 89);
  for (const route of sameEndpointLoops) {
    assert.ok(route.full_map_points?.length >= 3, route.id);
    assert.equal(route.full_map_points[0], route.full_map_points.at(-1), route.id);
  }
  assert.match(app, /function mapsUrlHasSameEnds\(value\)/);
  assert.match(app, /function splitLoopMapLegs\(route\)/);
  assert.match(app, /return split \? pointsMapsUrl\(split\.inbound\) : ''/);
});

test('Maale Akrabim routes are safe, mapped and explicit about the closure', () => {
  const related = expanded.routes.filter((route) => /מעלה עקרבים|כביש 227/.test([
    route.title,
    route.roads,
    ...(route.stops || []).map((stop) => stop.name),
  ].filter(Boolean).join(' ')));
  assert.equal([...related.map((route) => route.id)].sort().join(','), 'ext_s08,south-expansion-warning-014');

  const route = expanded.routes.find((item) => item.id === 'ext_s08');
  assert.equal(route.index, 260);
  assert.equal(route.start, 'פארק פרס, חולון');
  assert.equal(route.end, 'פארק פרס, חולון');
  assert.ok(route.map_points.length >= 2);
  assert.ok(route.full_map_points.length >= 2);
  assert.ok(route.stops.length >= 4);
  assert.ok(route.full_map_points.includes('חניון נחל גוב'));
  assert.ok(!route.full_map_points.some((point) => /אורון|ראש מעלה עקרבים/.test(point)));
  assert.match(route.cautions, /אין לעבור מחסום/);
  assert.match(route.verification_note, /מכביש 90/);
  assert.match(route.full_maps_url, /^https:\/\/www\.google\.com\/maps\/dir\//);
  assert.match(route.return_maps_url, /^https:\/\/www\.google\.com\/maps\/dir\//);
  assert.equal(new URL(route.full_maps_url).searchParams.get('origin') === new URL(route.full_maps_url).searchParams.get('destination'), false);
  assert.equal(new URL(route.return_maps_url).searchParams.get('origin') === new URL(route.return_maps_url).searchParams.get('destination'), false);
  assert.equal(route.map_leg_urls.length, 2);
  assert.equal(route.km_num, 425);

  const companion = expanded.routes.find((item) => item.id === 'south-expansion-warning-014');
  assert.ok(companion.map_points.length >= 2);
  assert.ok(companion.full_map_points.length >= 2);
  assert.ok(companion.stops.some((stop) => stop.navigation_excluded && /מעלה עקרבים/.test(stop.name)));
  assert.match(companion.full_maps_url, /^https:\/\/www\.google\.com\/maps\/dir\//);
  assert.match(companion.return_maps_url, /^https:\/\/www\.google\.com\/maps\/dir\//);
  assert.equal(new URL(companion.full_maps_url).searchParams.get('origin') === new URL(companion.full_maps_url).searchParams.get('destination'), false);
  assert.equal(new URL(companion.return_maps_url).searchParams.get('origin') === new URL(companion.return_maps_url).searchParams.get('destination'), false);
  assert.equal(companion.map_leg_urls.length, 2);
  assert.match(app, /function returnMapsUrl\(route\)/);
  assert.match(app, /returnMapsLink\(route/);
});

test('no OpenAI secret is present in deployable project files', () => {
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
