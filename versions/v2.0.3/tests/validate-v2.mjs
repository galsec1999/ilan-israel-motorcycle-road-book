/**
 * שער האיכות המקומי לגרסה 2
 * גרסת מסמך: 2.0.3
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
const manifest = JSON.parse(read('manifest.webmanifest'));
const index = read('index.html');
const app = read('assets/app-v2.js');
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

test('HTML exposes product and document versions, safety and all views', () => {
  assert.match(index, /גרסת מוצר 2\.0/);
  assert.match(index, /גרסת מסמך 2\.0\.3/);
  assert.match(index, /<meta name="robots" content="noindex,nofollow,noarchive,nosnippet">/);
  assert.doesNotMatch(index, /<iframe[^>]+book\.html/i);
  for (const view of ['routesView', 'journeysView', 'safetyView', 'plannerView', 'aboutView']) {
    assert.match(index, new RegExp(`id="${view}"`));
  }
  for (const required of ['אסור לעבור או לעקוף אותו', 'המאסף משחרר אותם', 'אין עקיפה מימין בשום מקרה', 'אין להשתמש באתר בזמן רכיבה']) {
    assert.ok(index.includes(required), required);
  }
});

test('filter, map, speech, AI and legacy migration code is present', () => {
  for (const functionName of ['filterRoutes', 'renderJourneys', 'pointsMapsUrl', 'openAi', 'localGroundedAnswer', 'migrateLegacyStorage']) {
    assert.match(app, new RegExp(`function ${functionName}\\(`));
  }
  assert.match(app, /window\.speechSynthesis/);
  assert.match(app, /roadTripCombinedV02/);
  assert.match(app, /routeId === 'r028'/);
  assert.match(app, /filter\(\(spring\) => spring && spring\.name\)/);
});

test('manifest is relative, installable and versioned', () => {
  assert.equal(manifest.version, '2.0');
  assert.equal(manifest.document_version, '2.0.3');
  assert.equal(manifest.start_url, './?source=pwa');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.src.startsWith('./')));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.src.startsWith('./')));
});

test('service worker cannot delete caches owned by other projects', () => {
  assert.match(serviceWorker, /CACHE_PREFIX\s*=\s*['"]ilan-road-book-['"]/);
  assert.match(serviceWorker, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(serviceWorker, /keys\.filter\(\(key\) => key !== CACHE_NAME\)/);
  assert.doesNotMatch(serviceWorker, /maps\.google|api\/v2\/ask|api\/v2\/speech/);
});

test('robots and offline shell are ready for an unlisted deployment', () => {
  assert.equal(read('robots.txt').trim(), 'User-agent: *\nDisallow: /');
  assert.match(read('offline.html'), /גרסת מסמך 2\.0\.3/);
  for (const relative of [
    'index.html', 'offline.html', 'manifest.webmanifest', 'sw.js',
    'assets/app-v2.css', 'assets/app-v2.js', 'data/config-v2.js',
    'data/legacy-content-v2.js', 'data/new-routes-v2.js',
    'icons/icon-192.png', 'icons/icon-512.png',
  ]) assert.ok(fs.existsSync(path.join(root, relative)), relative);
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
