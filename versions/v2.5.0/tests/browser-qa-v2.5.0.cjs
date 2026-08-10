/**
 * בדיקת דפדפן מקצה לקצה — גרסת מסמך 2.5.1
 * גרסת מוצר: 2.5.0
 * גרסת קטלוג מסלולים: 2.3.0
 *
 * הרצה: הגדרת NODE_PATH לספריות סביבת Codex ואז:
 * node tests/browser-qa-v2.5.0.cjs http://127.0.0.1:4182/ --write
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const VERSION = '2.5.0';
const DOCUMENT_VERSION = '2.5.1';
const CATALOG_VERSION = '2.3.0';
const PASS_ROUTE_ID = 'n21';
const FALLBACK_WARNING_ROUTE_ID = 'r002';
const PERSONAL_NOTE = 'בדיקת QA אישית — נשמר מקומית ומתמיד לאחר רענון';
const ROOT = path.resolve(__dirname, '..');
const URL_UNDER_TEST = process.argv.find((arg) => /^https?:\/\//.test(arg)) || 'http://127.0.0.1:4182/';
const WRITE = process.argv.includes('--write');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
let activeBrowser = null;

function appUrl({ route = '', hash = 'routesView' } = {}) {
  const url = new URL(URL_UNDER_TEST);
  if (route) url.searchParams.set('route', route);
  else url.searchParams.delete('route');
  url.hash = hash;
  return url.href;
}

async function acceptDisclaimer(page) {
  const dialog = page.locator('#disclaimerDialog');
  if (await dialog.evaluate((node) => node.open).catch(() => false)) {
    await page.locator('#acceptDisclaimer').check();
    await page.locator('#confirmDisclaimer').click();
  }
}

async function waitForCatalog(page) {
  await page.waitForFunction(() => document.querySelector('#statRoutes')?.textContent !== '—');
}

async function visibleCount(locator) {
  return locator.evaluateAll((nodes) => nodes.filter((node) => {
    const style = getComputedStyle(node);
    return !node.hidden && style.display !== 'none' && style.visibility !== 'hidden';
  }).length);
}

async function downloadedFile(page, action) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    action(),
  ]);
  const downloadedPath = await download.path();
  assert.ok(downloadedPath, `לא התקבל נתיב להורדה: ${download.suggestedFilename()}`);
  const bytes = fs.readFileSync(downloadedPath);
  return {
    filename: download.suggestedFilename(),
    bytes,
    text: bytes.toString('utf8'),
  };
}

async function downloadedHtml(page, action) {
  const download = await downloadedFile(page, action);
  return { ...download, html: download.text };
}

async function routeIds(page, selector = '#routeGrid .route-card') {
  return page.locator(selector).evaluateAll((nodes) => nodes.map((node) => node.dataset.routeId));
}

async function dayKilometers(page) {
  return page.locator('#routeGrid .route-card .day-facts > div:first-child strong').evaluateAll((nodes) =>
    nodes.map((node) => Number.parseFloat(node.textContent.replace(/[^\d.]/g, ''))));
}

function assertOrdered(values, direction, label) {
  assert.ok(values.length > 1, `${label}: נדרשים לפחות שני ערכים`);
  assert.ok(values.every(Number.isFinite), `${label}: נמצא אומדן מרחק שאינו מספר`);
  for (let index = 1; index < values.length; index += 1) {
    const ordered = direction === 'asc' ? values[index - 1] <= values[index] : values[index - 1] >= values[index];
    assert.ok(ordered, `${label}: ${values[index - 1]} ואז ${values[index]}`);
  }
}

function monitorPage(page, pageErrors, consoleErrors) {
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/google|maps|favicon|Failed to load resource|ERR_|net::/i.test(message.text())) {
      consoleErrors.push(message.text());
    }
  });
}

async function verifyDeepLinks(context, warningRouteId, pageErrors, consoleErrors) {
  const result = {};

  const passPage = await context.newPage();
  monitorPage(passPage, pageErrors, consoleErrors);
  await passPage.goto(appUrl({ route: PASS_ROUTE_ID, hash: 'routesView' }), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForCatalog(passPage);
  await acceptDisclaimer(passPage);
  await passPage.locator('#routeDialog').waitFor({ state: 'visible' });
  assert.equal(await passPage.locator('#routesView').isVisible(), true);
  assert.equal(new URL(passPage.url()).searchParams.get('route'), PASS_ROUTE_ID);
  assert.ok((await passPage.locator('#routeDialogTitle').textContent()).trim());
  await passPage.locator('[data-close-dialog]').click();
  assert.equal(new URL(passPage.url()).searchParams.has('route'), false);
  result.pass = true;
  await passPage.close();

  const warningPage = await context.newPage();
  monitorPage(warningPage, pageErrors, consoleErrors);
  await warningPage.goto(appUrl({ route: warningRouteId, hash: 'issuesView' }), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForCatalog(warningPage);
  await acceptDisclaimer(warningPage);
  await warningPage.locator('#routeDialog').waitFor({ state: 'visible' });
  assert.equal(await warningPage.locator('#issuesView').isVisible(), true);
  assert.equal(new URL(warningPage.url()).searchParams.get('route'), warningRouteId);
  assert.equal(await warningPage.locator('#routeDialog .route-issue-detail').count(), 1);
  assert.match(await warningPage.locator('#routeDialog .route-issue-detail').textContent(), /⚠|הערה|דורש/);
  await warningPage.locator('[data-close-dialog]').click();
  assert.equal(new URL(warningPage.url()).searchParams.has('route'), false);
  result.warning = true;
  await warningPage.close();

  const invalidPage = await context.newPage();
  monitorPage(invalidPage, pageErrors, consoleErrors);
  await invalidPage.goto(appUrl({ route: 'missing-route-250', hash: 'routesView' }), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForCatalog(invalidPage);
  await acceptDisclaimer(invalidPage);
  assert.equal(await invalidPage.locator('#routeDialog').evaluate((node) => node.open), false);
  assert.equal(new URL(invalidPage.url()).searchParams.has('route'), false);
  assert.equal(await invalidPage.locator('#routeGrid .route-card').count(), 90);
  result.invalid = true;
  await invalidPage.close();

  return result;
}

async function openAndCloseRoute(page, routeId, grid = '#routeGrid') {
  await page.locator(`${grid} [data-route-id="${routeId}"] [data-open-route]`).first().click();
  await page.locator('#routeDialog').waitFor({ state: 'visible' });
  await page.locator('[data-close-dialog]').click();
  await page.locator('#routeDialog').waitFor({ state: 'hidden' });
}

async function verifyRecentRoutes(page, ids) {
  assert.ok(ids.length >= 9, 'בדיקת מסלולים אחרונים דורשת תשעה מסלולי PASS');
  const storageKey = await page.evaluate(() => window.ROAD_BOOK_CONFIG.recentRoutesKey);

  await page.evaluate(({ key, routeIdsToStore }) => {
    localStorage.setItem(key, JSON.stringify(['missing-route-250', routeIdsToStore[0], routeIdsToStore[0], routeIdsToStore[1]]));
  }, { key: storageKey, routeIdsToStore: ids });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await acceptDisclaimer(page);
  await waitForCatalog(page);
  await page.locator('[data-view="plannerView"]').first().click();
  assert.deepEqual(
    await page.locator('#recentRoutesGrid [data-recent-route]').evaluateAll((nodes) => nodes.map((node) => node.dataset.recentRoute)),
    ids.slice(0, 2),
    'מזהים חסרים וכפולים צריכים להיחתך מן ההיסטוריה המוצגת',
  );
  await page.locator('#clearRecentRoutes').click();
  assert.equal(await page.locator('#recentRoutesGrid [data-recent-route]').count(), 0);
  assert.equal(await page.locator('#recentRoutesEmpty').isVisible(), true);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), null);

  await page.locator('[data-view="routesView"]').first().click();
  await page.locator('#clearFilters').click();
  for (const routeId of ids.slice(0, 9)) await openAndCloseRoute(page, routeId);
  const expectedMru = ids.slice(1, 9).reverse();
  assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey), expectedMru);

  await page.locator('[data-view="plannerView"]').first().click();
  assert.deepEqual(
    await page.locator('#recentRoutesGrid [data-recent-route]').evaluateAll((nodes) => nodes.map((node) => node.dataset.recentRoute)),
    expectedMru,
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await acceptDisclaimer(page);
  await waitForCatalog(page);
  assert.deepEqual(
    await page.locator('#recentRoutesGrid [data-recent-route]').evaluateAll((nodes) => nodes.map((node) => node.dataset.recentRoute)),
    expectedMru,
    'סדר MRU צריך לשרוד רענון',
  );
  await page.locator('#clearRecentRoutes').click();
  await page.locator('[data-view="routesView"]').first().click();
  return { limit: expectedMru.length, newest: expectedMru[0], persisted: true, invalid_ids_filtered: true };
}

async function verifyComparison(page, ids) {
  assert.ok(ids.length >= 3, 'בדיקת השוואה דורשת שלושה מסלולים');
  const selected = ids.slice(0, 2);
  const rejected = ids[2];
  const storageKey = await page.evaluate(() => window.ROAD_BOOK_CONFIG.compareRoutesKey);
  await page.evaluate((key) => localStorage.removeItem(key), storageKey);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await acceptDisclaimer(page);
  await waitForCatalog(page);
  await page.locator('#clearFilters').click();

  for (const routeId of selected) {
    await page.locator(`#routeGrid [data-route-id="${routeId}"] [data-compare-route]`).click();
  }
  assert.equal(await page.locator('#compareSelectionCount').textContent(), '2/2');
  assert.equal(await page.locator('#openCompare').isEnabled(), true);
  assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey), selected);

  await page.locator(`#routeGrid [data-route-id="${rejected}"] [data-compare-route]`).click();
  assert.deepEqual(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey),
    selected,
    'בחירה שלישית אינה רשאית להחליף מסלול בשקט',
  );
  assert.match(await page.locator('#copyStatus').textContent(), /כבר נבחרו שני מסלולים/);
  assert.equal(await page.locator(`#routeGrid [data-route-id="${rejected}"] [data-compare-route]`).getAttribute('aria-pressed'), 'false');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await acceptDisclaimer(page);
  await waitForCatalog(page);
  assert.equal(await page.locator('#compareSelectionCount').textContent(), '2/2');
  for (const routeId of selected) {
    assert.equal(await page.locator(`#routeGrid [data-route-id="${routeId}"] [data-compare-route]`).getAttribute('aria-pressed'), 'true');
  }
  await page.locator('#openCompare').click();
  await page.locator('#compareDialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#compareContent [data-compare-card]').count(), 2);
  assert.equal(await page.locator('#compareContent .compare-facts').count(), 2);
  assert.deepEqual(
    await page.locator('#compareContent [data-compare-card]').evaluateAll((nodes) => nodes.map((node) => node.dataset.compareCard)),
    selected,
  );
  await page.locator('#clearComparisonDialog').click();
  assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey), []);
  assert.equal(await page.locator('#compareContent [data-compare-card]').count(), 0);
  await page.locator('#compareDialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[role="tab"][aria-selected="true"]').evaluate((node) => node === document.activeElement), true);
  assert.equal(await page.locator('#compareTray').isHidden(), true);
  return { selected, third_rejected: rejected, persisted: true, exact_limit: 2 };
}

async function verifyFilterSharing(page, context, pageErrors, consoleErrors) {
  await page.locator('[data-view="routesView"]').first().click();
  await page.locator('#clearFilters').click();
  await page.locator('#directionFilter').selectOption('north');
  const firstNorthTitle = (await page.locator('#routeGrid .route-card h3').first().textContent()).trim();
  const filterQuery = (firstNorthTitle.split(/\s+/).find((word) => word.length >= 3) || firstNorthTitle).slice(0, 12);
  await page.locator('#searchInput').fill(filterQuery);
  await page.locator('#sortFilter').selectOption('title');
  if ((await page.locator('#compactToggle').getAttribute('aria-pressed')) !== 'true') await page.locator('#compactToggle').click();
  const expectedIds = await routeIds(page);
  assert.ok(expectedIds.length > 0 && expectedIds.length < 90);
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.set('route', 'n21');
    url.searchParams.set('source', 'qa-private-source');
    url.searchParams.set('personal', 'ridden');
    url.searchParams.set('favorites', '1');
    url.searchParams.set('note', 'private-note');
    url.searchParams.set('checklist', 'private-checklist');
    url.searchParams.set('recent', 'private-recent');
    history.replaceState(null, '', url.href);
  });
  await page.locator('#copyFilterLink').click();
  const sharedHref = await page.evaluate(() => navigator.clipboard.readText());
  const sharedUrl = new URL(sharedHref);
  assert.equal(sharedUrl.searchParams.get('q'), filterQuery);
  assert.equal(sharedUrl.searchParams.get('direction'), 'north');
  assert.equal(sharedUrl.searchParams.get('sort'), 'title');
  assert.equal(sharedUrl.searchParams.get('layout'), 'compact');
  assert.equal(sharedUrl.hash, '#routesView');
  for (const privateParam of ['route', 'source', 'personal', 'personalFilter', 'favorites', 'favoritesOnly', 'note', 'checklist', 'recent']) {
    assert.equal(sharedUrl.searchParams.has(privateParam), false, `מידע אישי זלג לקישור: ${privateParam}`);
  }

  const roundtrip = await context.newPage();
  monitorPage(roundtrip, pageErrors, consoleErrors);
  await roundtrip.goto(sharedHref, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await acceptDisclaimer(roundtrip);
  await waitForCatalog(roundtrip);
  assert.equal(await roundtrip.locator('#searchInput').inputValue(), filterQuery);
  assert.equal(await roundtrip.locator('#directionFilter').inputValue(), 'north');
  assert.equal(await roundtrip.locator('#sortFilter').inputValue(), 'title');
  assert.equal(await roundtrip.locator('#compactToggle').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await routeIds(roundtrip), expectedIds);
  await roundtrip.close();

  await page.locator('#clearFilters').click();
  if ((await page.locator('#compactToggle').getAttribute('aria-pressed')) === 'true') await page.locator('#compactToggle').click();
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.search = '';
    url.hash = 'routesView';
    history.replaceState(null, '', url.href);
  });
  return { url: sharedHref, query: filterQuery, result_count: expectedIds.length, roundtrip: true, private_params_excluded: true };
}

async function verifyFreshness(page, warningRouteId) {
  await page.locator('[data-view="routesView"]').first().click();
  await page.locator('#clearFilters').click();
  const passBadges = page.locator('#routeGrid .route-card .freshness-badge');
  assert.equal(await passBadges.count(), 90);
  const passStates = await passBadges.evaluateAll((nodes) => nodes.map((node) => ({
    state: node.dataset.freshness,
    title: node.getAttribute('title') || '',
    text: node.textContent.trim(),
  })));
  assert.equal(passStates.every((item) => ['fresh', 'refresh', 'unknown'].includes(item.state)), true);
  const suffixedDateBadge = page.locator(`#routeGrid [data-route-id="${PASS_ROUTE_ID}"] .freshness-badge`);
  assert.equal(await suffixedDateBadge.getAttribute('data-freshness'), 'fresh');
  assert.match(await suffixedDateBadge.getAttribute('title'), /מועד בדיקת תיק המסלול/);
  assert.match(
    await page.locator(`#routeGrid [data-route-id="${PASS_ROUTE_ID}"] .day-facts > div:nth-child(4) strong`).textContent(),
    /09\.08\.2026\s+—/,
  );
  assert.match(await suffixedDateBadge.textContent(), /נבדק לאחרונה/);

  await page.locator('[data-view="issuesView"]').first().click();
  assert.equal(await page.locator('#issueRouteGrid .route-card .freshness-badge').count(), 90);
  const warningBadge = page.locator(`#issueRouteGrid [data-route-id="${warningRouteId}"] .freshness-badge`);
  assert.equal(await warningBadge.count(), 1);
  assert.ok(['fresh', 'refresh', 'unknown'].includes(await warningBadge.getAttribute('data-freshness')));
  await page.locator('[data-view="routesView"]').first().click();
  return {
    pass_badges: passStates.length,
    warning_badges: 90,
    suffixed_date_parsed: true,
    states: [...new Set(passStates.map((item) => item.state))],
  };
}

async function measureHorizontalOverflow(page, gridSelector) {
  return page.evaluate((selector) => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
    cards_inside_viewport: [...document.querySelectorAll(`${selector} .route-card`)].every((card) => {
      const rect = card.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= document.documentElement.clientWidth + 1;
    }),
  }), gridSelector);
}

async function verifyCompactLayout(page) {
  await page.locator('[data-view="routesView"]').first().click();
  await page.locator('#clearFilters').click();
  if ((await page.locator('#compactToggle').getAttribute('aria-pressed')) !== 'true') await page.locator('#compactToggle').click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.layout), 'compact');
  assert.equal(await page.evaluate(() => localStorage.getItem(window.ROAD_BOOK_CONFIG.layoutKey)), 'compact');
  const passCard = page.locator(`#routeGrid [data-route-id="${PASS_ROUTE_ID}"]`);
  assert.equal(await passCard.locator('h3').isVisible(), true);
  assert.equal(await passCard.locator('[data-open-route]').first().isVisible(), true);
  assert.equal(await passCard.locator('.map-preview').isHidden(), true);
  assert.equal(await passCard.locator('.route-card-summary').isHidden(), true);
  assert.equal(await passCard.locator('.route-card-secondary-actions').isHidden(), true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await acceptDisclaimer(page);
  await waitForCatalog(page);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.layout), 'compact');
  assert.equal(await page.locator('#compactToggle').getAttribute('aria-pressed'), 'true');
  await page.setViewportSize({ width: 360, height: 780 });
  const passOverflow = await measureHorizontalOverflow(page, '#routeGrid');
  assert.ok(passOverflow.document <= 1 && passOverflow.body <= 1 && passOverflow.cards_inside_viewport, JSON.stringify(passOverflow));
  await page.locator('[data-view="issuesView"]').first().click();
  const warningOverflow = await measureHorizontalOverflow(page, '#issueRouteGrid');
  assert.ok(warningOverflow.document <= 1 && warningOverflow.body <= 1 && warningOverflow.cards_inside_viewport, JSON.stringify(warningOverflow));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('[data-view="routesView"]').first().click();
  await page.locator('#compactToggle').click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.layout), 'comfortable');
  return { persisted: true, pass_mobile_overflow: passOverflow, warning_mobile_overflow: warningOverflow };
}

async function verifyChecklist(page) {
  await page.locator('[data-view="safetyView"]').first().click();
  const storageKeys = await page.evaluate(() => ({
    checklist: window.ROAD_BOOK_CONFIG.departureChecklistKey,
    personal: window.ROAD_BOOK_CONFIG.personalRoutesKey,
  }));
  const unrelatedValue = JSON.stringify({ untouched: true, marker: 'qa-2.5.0' });
  const personalSentinel = JSON.stringify({ 'qa-sentinel': { status: 'want', note: 'must-survive-checklist-reset' } });
  const originalPersonal = await page.evaluate(({ personalKey, unrelated, personal }) => {
    const original = localStorage.getItem(personalKey);
    localStorage.setItem(personalKey, personal);
    localStorage.setItem('roadbook-qa-unrelated', unrelated);
    return original;
  }, { personalKey: storageKeys.personal, unrelated: unrelatedValue, personal: personalSentinel });
  const inputs = page.locator('#departureChecklist [data-checklist-item]');
  assert.equal(await inputs.count(), 8);
  await inputs.nth(0).check();
  await inputs.nth(3).check();
  await inputs.nth(7).check();
  assert.equal(await page.locator('#checklistProgress').textContent(), '3/8 הושלמו');
  assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKeys.checklist), {
    version: 1,
    checked: ['road-status', 'stops-fuel', 'essentials'],
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await acceptDisclaimer(page);
  await waitForCatalog(page);
  assert.equal(await page.locator('#checklistProgress').textContent(), '3/8 הושלמו');
  assert.deepEqual(await inputs.evaluateAll((nodes) => nodes.filter((node) => node.checked).map((node) => node.dataset.checklistItem)), [
    'road-status', 'stops-fuel', 'essentials',
  ]);
  await page.locator('#resetDepartureChecklist').click();
  assert.equal(await page.locator('#checklistProgress').textContent(), '0/8 הושלמו');
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKeys.checklist), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('roadbook-qa-unrelated')), unrelatedValue);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKeys.personal), personalSentinel);
  await page.evaluate(({ personalKey, original }) => {
    if (original === null) localStorage.removeItem(personalKey);
    else localStorage.setItem(personalKey, original);
    localStorage.removeItem('roadbook-qa-unrelated');
  }, { personalKey: storageKeys.personal, original: originalPersonal });
  await page.locator('[data-view="routesView"]').first().click();
  return { items: 8, persisted: true, reset_isolated: true };
}

async function main() {
  assert.ok(fs.existsSync(CHROME), `Chrome לא נמצא: ${CHROME}`);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  activeBrowser = browser;
  const context = await browser.newContext({
    acceptDownloads: true,
    locale: 'he-IL',
    viewport: { width: 1280, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  monitorPage(page, pageErrors, consoleErrors);

  await page.goto(appUrl(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await acceptDisclaimer(page);
  await waitForCatalog(page);

  const assets = await page.evaluate(() => ({
    title: document.title,
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href'),
    styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map((node) => node.getAttribute('href')),
    scripts: [...document.scripts].map((node) => node.getAttribute('src')).filter(Boolean),
    configVersion: window.ROAD_BOOK_CONFIG?.version,
    releaseAuditVersion: window.ROAD_BOOK_RELEASE_AUDIT?.version,
    expansionVersion: window.ROAD_BOOK_V23_EXPANSION?.version,
  }));
  assert.match(assets.title, /2\.5\.0/);
  assert.equal(assets.lang, 'he');
  assert.equal(assets.dir, 'rtl');
  assert.equal(assets.manifest, './manifest-2.5.0.webmanifest');
  assert.ok(assets.styles.includes('./assets/app-v2.5.0.css'));
  assert.ok(assets.scripts.includes('./data/config-v2.5.0.js'));
  assert.ok(assets.scripts.includes('./assets/app-v2.5.0.js'));
  assert.ok(assets.scripts.includes('./data/route-expansion-v2.3.0.js'));
  assert.ok(assets.scripts.includes('./data/release-audit-v2.3.0.js'));
  assert.equal(assets.configVersion, VERSION);
  assert.equal(assets.releaseAuditVersion, CATALOG_VERSION);
  assert.equal(assets.expansionVersion, CATALOG_VERSION);

  const fetchedAssets = await page.evaluate(async () => {
    const [manifest, config, serviceWorker] = await Promise.all([
      fetch('./manifest-2.5.0.webmanifest').then((response) => response.json()),
      fetch('./data/config-v2.5.0.js').then((response) => response.text()),
      fetch('./sw.js').then((response) => response.text()),
    ]);
    return { manifest, config, serviceWorker };
  });
  assert.equal(fetchedAssets.manifest.version, VERSION);
  assert.match(fetchedAssets.manifest.name, /2\.5\.0/);
  assert.match(fetchedAssets.config, /version:\s*'2\.5\.0'/);
  assert.match(fetchedAssets.serviceWorker, /const CACHE_PREFIX = 'ilan-roadbook-v250-'/);
  assert.match(fetchedAssets.serviceWorker, /const CACHE_NAME = `\$\{CACHE_PREFIX\}build-1`/);
  assert.match(fetchedAssets.serviceWorker, /route-expansion-v2\.3\.0\.js/);
  assert.match(fetchedAssets.serviceWorker, /release-audit-v2\.3\.0\.js/);

  assert.equal(await page.locator('#statRoutes').textContent(), '90');
  assert.equal(await page.locator('#statIssueRoutes').textContent(), '90');
  assert.equal(await page.locator('#issueTabCount').textContent(), '90');
  assert.equal(await page.locator('#routeGrid .route-card').count(), 90);
  assert.match(await page.locator('[data-star-count="all"]').textContent(), /90 ב־PASS · 90 עם הערה/);
  assert.match(await page.locator('#visitCountLabel').textContent(), /כניסות במכשיר זה|כניסות לאתר/);
  assert.ok(Number(await page.locator('#visitCount').textContent()) >= 1);
  const passIds = new Set(await routeIds(page));
  assert.equal(passIds.size, 90);
  assert.ok(passIds.has(PASS_ROUTE_ID));

  const warningRouteId = await page.evaluate((fallback) =>
    window.ROAD_BOOK_RELEASE_AUDIT?.withheld_legacy_route_ids?.[0] || fallback, FALLBACK_WARNING_ROUTE_ID);
  const deepLinks = await verifyDeepLinks(context, warningRouteId, pageErrors, consoleErrors);
  const passRouteIds = [...passIds];
  const recentRoutes = await verifyRecentRoutes(page, passRouteIds);
  const comparison = await verifyComparison(page, passRouteIds);
  const freshness = await verifyFreshness(page, warningRouteId);
  const filterSharing = await verifyFilterSharing(page, context, pageErrors, consoleErrors);
  const compactLayout = await verifyCompactLayout(page);
  const departureChecklist = await verifyChecklist(page);

  const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme || 'system');
  await page.locator('#themeToggle').click();
  const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme);
  assert.notEqual(themeAfter, themeBefore);
  assert.equal(await page.evaluate(() => localStorage.getItem(window.ROAD_BOOK_CONFIG.themeKey)), themeAfter);

  await page.locator('#directionFilter').selectOption('north');
  const northCount = await page.locator('#routeGrid .route-card').count();
  assert.ok(northCount > 0 && northCount < 90, `מסנן צפון החזיר ${northCount}`);
  assert.equal(await page.locator('#routeGrid .route-card').evaluateAll((cards) => cards.every((card) =>
    [...card.querySelectorAll('.chips .chip')].some((chip) => chip.textContent.trim() === 'צפון'))), true);
  await page.locator('#clearFilters').click();

  await page.locator('#patternFilter').selectOption('snake');
  const snakeCount = await page.locator('#routeGrid .route-card').count();
  assert.ok(snakeCount > 0 && snakeCount < 90, `מסנן נחש החזיר ${snakeCount}`);
  assert.equal(await page.locator('#routeGrid .route-card').evaluateAll((cards) => cards.every((card) =>
    [...card.querySelectorAll('.chips .chip')].some((chip) => chip.textContent.includes('נחש —')))), true);
  await page.locator('#clearFilters').click();

  await page.locator('#dayLengthFilter').selectOption('half');
  const halfDayCount = await page.locator('#routeGrid .route-card').count();
  assert.ok(halfDayCount > 0 && halfDayCount < 90, `מסנן חצי יום החזיר ${halfDayCount}`);
  assert.equal(await page.locator('#routeGrid .route-card').evaluateAll((cards) => cards.every((card) =>
    [...card.querySelectorAll('.chips .chip')].some((chip) => chip.textContent.trim() === 'חצי יום'))), true);
  await page.locator('#clearFilters').click();

  await page.locator('[data-quick="calm"]').click();
  const calmCount = await page.locator('#routeGrid .route-card').count();
  assert.ok(calmCount > 0 && calmCount < 90, `בחירה מהירה רגועה החזירה ${calmCount}`);
  assert.equal(await page.locator('#routeGrid .route-card').evaluateAll((cards) => cards.every((card) => card.dataset.releaseState === 'pass')), true);
  await page.locator('#clearFilters').click();

  await page.locator('#sortFilter').selectOption('day-short');
  const shortOrder = await dayKilometers(page);
  assertOrdered(shortOrder, 'asc', 'מיון יום קצר תחילה');
  await page.locator('#sortFilter').selectOption('day-long');
  const longOrder = await dayKilometers(page);
  assertOrdered(longOrder, 'desc', 'מיון יום ארוך תחילה');
  await page.locator('#clearFilters').click();

  await page.locator('#openPicker').click();
  await page.locator('#pickerDialog').waitFor({ state: 'visible' });
  await page.locator('#pickerDay').selectOption('half');
  await page.locator('#pickerForm button[type="submit"]').click();
  await page.locator('#pickerResult [data-picker-open]').waitFor({ state: 'visible' });
  const pickerRouteId = await page.locator('#pickerResult [data-picker-open]').getAttribute('data-picker-open');
  assert.ok(passIds.has(pickerRouteId), `הבורר הציע מסלול שאינו PASS: ${pickerRouteId}`);
  assert.match(await page.locator('#pickerResult').textContent(), /נבחר מתוך \d+ מסלולים מתאימים/);
  assert.match(await page.locator('#pickerResult').textContent(), /יום מהמרכז/);
  await page.locator('[data-close-picker]').click();

  const passCard = page.locator(`#routeGrid [data-route-id="${PASS_ROUTE_ID}"]`);
  assert.equal(await passCard.count(), 1);
  await passCard.locator(`[data-personal-route="${PASS_ROUTE_ID}"][data-personal-status="want"]`).click();
  let personalStored = await page.evaluate((routeId) => {
    const value = JSON.parse(localStorage.getItem(window.ROAD_BOOK_CONFIG.personalRoutesKey) || '{}');
    return value[routeId];
  }, PASS_ROUTE_ID);
  assert.equal(personalStored.status, 'want');
  await page.locator('#personalFilter').selectOption('want');
  assert.deepEqual(await routeIds(page), [PASS_ROUTE_ID]);
  await page.locator('#clearFilters').click();

  await passCard.locator('[data-open-route]').first().click();
  await page.locator('#routeDialog').waitFor({ state: 'visible' });
  await page.locator('#personalStatus').selectOption('ridden');
  await page.locator('#personalNote').fill(PERSONAL_NOTE);
  await page.locator(`#routeDialog [data-save-personal="${PASS_ROUTE_ID}"]`).click();
  personalStored = await page.evaluate((routeId) => {
    const value = JSON.parse(localStorage.getItem(window.ROAD_BOOK_CONFIG.personalRoutesKey) || '{}');
    return value[routeId];
  }, PASS_ROUTE_ID);
  assert.equal(personalStored.status, 'ridden');
  assert.equal(personalStored.note, PERSONAL_NOTE);
  assert.match(personalStored.updatedOn, /^\d{4}-\d{2}-\d{2}$/);
  await page.locator('[data-close-dialog]').click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await acceptDisclaimer(page);
  await waitForCatalog(page);
  await page.locator(`#routeGrid [data-route-id="${PASS_ROUTE_ID}"] [data-open-route]`).first().click();
  assert.equal(await page.locator('#personalStatus').inputValue(), 'ridden');
  assert.equal(await page.locator('#personalNote').inputValue(), PERSONAL_NOTE);
  await page.locator('[data-close-dialog]').click();
  await page.locator('#personalFilter').selectOption('ridden');
  assert.deepEqual(await routeIds(page), [PASS_ROUTE_ID]);
  await page.locator('[data-view="plannerView"]').first().click();
  assert.equal(await page.locator('#plannerRiddenCount').textContent(), '1');
  assert.ok(await page.locator(`#favoritesGrid [data-route-id="${PASS_ROUTE_ID}"]`).count());
  await page.locator('[data-view="routesView"]').first().click();
  await page.locator('#clearFilters').click();

  await page.locator(`#routeGrid [data-route-id="${PASS_ROUTE_ID}"] [data-enlarge-map]`).click();
  await page.locator('#mapDialog').waitFor({ state: 'visible' });
  assert.match(await page.locator('#mapDialogTitle').textContent(), /מפת המסלול/);
  assert.match(await page.locator('#largeMapFrame').getAttribute('src'), /^https:\/\/maps\.google\.com\/maps\?/);
  assert.match(await page.locator('#largeMapGoogle').getAttribute('href'), /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1/);
  await page.locator('[data-close-map]').click();
  assert.equal(await page.locator('#largeMapFrame').getAttribute('src'), null);

  await page.locator(`#routeGrid [data-route-id="${PASS_ROUTE_ID}"] [data-ready-share]`).click();
  await page.locator('#readyShareDialog').waitFor({ state: 'visible' });
  const readyPass = await page.locator('#readySharePreview').inputValue();
  assert.match(readyPass, /ספר הטיולים של אילן · גרסה 2\.5\.0/);
  assert.match(readyPass, /אומדן יום מהמרכז/);
  assert.match(readyPass, /נקודת מפגש ראשונה/);
  assert.match(readyPass, /route=n21/);
  assert.match(readyPass, /כל רוכב רוכב באחריותו הבלעדית/);
  await page.locator('#copyReadyShare').click();
  assert.equal(
    (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'),
    readyPass.replace(/\r\n/g, '\n'),
  );
  await page.locator('#copyReadyLink').click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /[?&]route=n21/);
  await page.locator('[data-close-ready-share]').click();

  await page.locator('[data-view="issuesView"]').first().click();
  await page.locator(`#issueRouteGrid [data-route-id="${warningRouteId}"] [data-ready-share]`).click();
  await page.locator('#readyShareDialog').waitFor({ state: 'visible' });
  const readyWarning = await page.locator('#readySharePreview').inputValue();
  assert.match(readyWarning, /⚠️/);
  assert.match(readyWarning, new RegExp(`route=${warningRouteId}`));
  assert.match(readyWarning, /כל רוכב רוכב באחריותו הבלעדית/);
  await page.locator('[data-close-ready-share]').click();

  const severityCounts = await Promise.all([
    '#issueSeverityCountMinor', '#issueSeverityCountConditional', '#issueSeverityCountMajor',
  ].map((selector) => page.locator(selector).textContent().then(Number)));
  assert.equal(severityCounts.reduce((sum, value) => sum + value, 0), 90);
  assert.ok(severityCounts.every((value) => value > 0));
  assert.equal(await page.locator('#issueRouteGrid .route-issue-warning').count(), 90);
  await page.locator('#issueSeverityFilters button[data-issue-severity="conditional"]').click();
  assert.equal(await visibleCount(page.locator('#issueRouteGrid .route-card')), severityCounts[1]);
  await page.locator('#issueSeverityFilters button[data-issue-severity="all"]').click();

  const excludedNavigation = await page.evaluate(() => {
    const combinedRoutes = [
      ...(window.ROAD_BOOK_LEGACY_CONTENT?.routes || []),
      ...(window.ROAD_BOOK_NEW_ROUTES?.routes || []),
      ...(window.ROAD_BOOK_V23_EXPANSION?.routes || []),
    ];
    for (const route of combinedRoutes) {
      const stop = (route.stops || []).find((item) => item.navigation_excluded);
      if (stop) return { routeId: route.id, stopName: stop.name, reason: stop.navigation_exclusion_reason };
    }
    return null;
  });
  assert.ok(excludedNavigation, 'לא נמצא מסלול עם נקודה תיעודית שהוחרגה מן הניווט');
  const excludedCard = page.locator(`#issueRouteGrid [data-route-id="${excludedNavigation.routeId}"]`);
  assert.equal(await excludedCard.count(), 1);
  await excludedCard.locator('[data-open-route]').first().click();
  await page.locator('#routeDialog').waitFor({ state: 'visible' });
  const excludedStopCard = page.locator('#routeDialog .stop-card').filter({ hasText: excludedNavigation.stopName });
  assert.equal(await excludedStopCard.count(), 1);
  assert.match(await excludedStopCard.locator('.navigation-exclusion-note').textContent(), /אינה כלולה בניווט/);
  assert.equal(await excludedStopCard.locator('a', { hasText: 'Waze' }).count(), 0);
  assert.ok((await excludedStopCard.textContent()).includes(excludedNavigation.reason.slice(0, 18)));
  await page.locator(`#routeDialog [data-copy-navigation="${excludedNavigation.routeId}"]`).click();
  const excludedNavigationClipboard = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(excludedNavigationClipboard.includes(excludedNavigation.stopName));
  assert.ok(excludedNavigationClipboard.includes(excludedNavigation.reason));
  const excludedLines = excludedNavigationClipboard.split(/\r?\n/);
  const excludedLineIndex = excludedLines.findIndex((line) => line.includes(excludedNavigation.stopName));
  assert.ok(excludedLineIndex >= 0, 'הנקודה המוחרגת חסרה בחבילת הניווט');
  assert.match(excludedLines[excludedLineIndex + 1] || '', /הוחרגה מן הניווט/);
  assert.doesNotMatch(excludedLines.slice(excludedLineIndex, excludedLineIndex + 2).join('\n'), /Waze:/);
  const warningExport = await downloadedHtml(page, () =>
    page.locator(`#routeDialog [data-export-route="${excludedNavigation.routeId}"]`).click());
  assert.match(warningExport.filename, /2\.5\.0.*\.html$/);
  assert.ok(warningExport.html.includes(excludedNavigation.reason));
  assert.match(warningExport.html, /נקודה תיעודית — אינה כלולה בניווט/);
  await page.locator('[data-close-dialog]').click();

  await page.locator('[data-view="routesView"]').first().click();
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.set('note', 'qa-private-note');
    url.searchParams.set('personal', 'ridden');
    url.searchParams.set('checklist', 'qa-private-checklist');
    url.searchParams.set('recent', 'qa-private-recent');
    url.searchParams.set('q', 'qa-filter-that-must-not-leak');
    history.replaceState(null, '', url.href);
  });
  await page.locator(`#routeGrid [data-route-id="${PASS_ROUTE_ID}"] [data-open-route]`).first().click();
  const passTitle = await page.locator('#routeDialogTitle').textContent();
  assert.ok(await page.locator('#routeDialog a', { hasText: 'מסלול מלא מהמרכז' }).count());
  assert.ok(await page.locator('#routeDialog a', { hasText: 'הציר הנופי בלבד' }).count());
  assert.match(await page.locator('#routeDialogContent').textContent(), /נקודות מפגש והצטרפות/);
  assert.ok(await page.locator('#routeDialog .connection-grid .info-card').count() >= 1);

  await page.locator(`#routeDialog [data-copy-navigation="${PASS_ROUTE_ID}"]`).click();
  const passNavigationClipboard = await page.evaluate(() => navigator.clipboard.readText());
  for (const expectedText of [
    'ניווט מרוכז', 'נקודת מפגש ראשית', 'Waze:', 'מפת גישה מהמרכז:',
    'מפת המסלול המלאה:', 'מפת הציר הנופי:', 'תחנות לפי הסדר:', 'קישור ישיר למסלול:',
  ]) assert.ok(passNavigationClipboard.includes(expectedText), `חסר בהעתקת הניווט: ${expectedText}`);
  assert.match(passNavigationClipboard, /[?&]route=n21/);
  const directRouteLine = passNavigationClipboard.split(/\r?\n/).find((line) => line.startsWith('קישור ישיר למסלול:'));
  assert.ok(directRouteLine, 'קישור ישיר למסלול חסר מחבילת הניווט');
  const directRouteUrl = new URL(directRouteLine.replace(/^קישור ישיר למסלול:\s*/, ''));
  assert.deepEqual([...directRouteUrl.searchParams.keys()], ['route']);
  assert.equal(directRouteUrl.searchParams.get('route'), PASS_ROUTE_ID);
  assert.doesNotMatch(directRouteUrl.href, /qa-private/);
  assert.ok((passNavigationClipboard.match(/https:\/\//g) || []).length >= 5);

  const copyAiButton = page.locator('#routeDialog [data-copy-stop-ai]').first();
  assert.match(await copyAiButton.getAttribute('title'), /Paste|הדבקה/);
  await copyAiButton.click();
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(clipboardText, /נקודת העניין:/);
  assert.match(clipboardText, /מקורות/);

  await page.locator(`#routeDialog [data-ai-route="${PASS_ROUTE_ID}"]`).first().click();
  await page.locator('#aiDialog').waitFor({ state: 'visible' });
  assert.match(await page.locator('#aiStatus').textContent(), /תיק המסלול|הספר/);
  await page.locator('#aiQuickQuestions [data-ai-question]').first().click();
  await page.locator('#aiForm button[type="submit"]').click();
  await page.locator('#aiAnswer').waitFor({ state: 'visible' });
  assert.match(await page.locator('#aiAnswer').textContent(), /מידע מתוך הספר|תדריך מתוך הספר/);
  assert.match(await page.locator('#aiStatus').textContent(), /מקומית מתוך הספר|אינו מחובר/);
  await page.locator('[data-close-ai]').click();

  const routeExport = await downloadedHtml(page, () =>
    page.locator(`#routeDialog [data-export-route="${PASS_ROUTE_ID}"]`).click());
  assert.match(routeExport.filename, /2\.5\.0.*\.html$/);
  assert.ok(routeExport.html.includes(passTitle));
  assert.match(routeExport.html, /noindex,nofollow,noarchive,nosnippet/);
  assert.match(routeExport.html, /נקודות מפגש והצטרפות/);
  assert.match(routeExport.html, /המשך טבעי למסלולים נוספים/);
  assert.match(routeExport.html, /אומדן יום מלא מהמרכז/);
  assert.match(routeExport.html, /[?&amp;]route=n21|[?&]route=n21/);

  await page.locator(`#routeDialog [data-add-combined="${PASS_ROUTE_ID}"]`).click();
  assert.match(await page.locator(`#routeDialog [data-add-combined="${PASS_ROUTE_ID}"]`).textContent(), /נוסף/);
  await page.locator(`#routeDialog [data-invite="${PASS_ROUTE_ID}"]`).first().click();
  await page.locator('#inviteDialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#meetingSecondaryEnabled').isChecked(), true);
  const invitePreview = await page.locator('#invitePreview').inputValue();
  assert.ok(invitePreview.includes(passTitle));
  assert.match(invitePreview, /יציאה מאזור המרכז/);
  assert.match(invitePreview, /נקודת הצטרפות בדרך/);
  assert.match(invitePreview, /מפגש \d{2}:\d{2} \| יציאה \d{2}:\d{2}/);
  assert.match(invitePreview, /כל רוכב רוכב באחריותו הבלעדית/);
  await page.locator('#inviteDate').fill('');
  await page.locator('#exportInviteCalendar').click();
  assert.match(await page.locator('#calendarStatus').textContent(), /לבחור תחילה תאריך/);
  assert.equal(await page.locator('#inviteDate').evaluate((node) => node === document.activeElement), true);
  await page.locator('#inviteDate').fill('2026-09-20');
  assert.match(await page.locator('#calendarStatus').textContent(), /התאריך נקבע/);
  const calendarDownload = await downloadedFile(page, () => page.locator('#exportInviteCalendar').click());
  assert.match(calendarDownload.filename, /2\.5\.0\.ics$/);
  assert.ok(calendarDownload.bytes.length > 500, `קובץ היומן קצר מדי: ${calendarDownload.bytes.length} בתים`);
  assert.equal(calendarDownload.text.includes('\uFFFD'), false, 'קובץ היומן אינו UTF-8 תקין');
  assert.equal(/(^|[^\r])\n/.test(calendarDownload.text), false, 'קובץ ICS חייב להשתמש ב־CRLF בלבד');
  assert.equal(calendarDownload.text.endsWith('\r\n'), true);
  const physicalCalendarLines = calendarDownload.text.split('\r\n');
  assert.equal(
    physicalCalendarLines.every((line) => Buffer.byteLength(line, 'utf8') <= 75),
    true,
    `שורת ICS חרגה מ־75 בתים: ${Math.max(...physicalCalendarLines.map((line) => Buffer.byteLength(line, 'utf8')))}`,
  );
  const unfoldedCalendar = calendarDownload.text.replace(/\r\n[ \t]/g, '');
  for (const expectedField of [
    'BEGIN:VCALENDAR\r\n',
    'VERSION:2.0\r\n',
    'PRODID:-//Ilan Road Book//PWA 2.5.0//HE\r\n',
    'CALSCALE:GREGORIAN\r\n',
    'METHOD:PUBLISH\r\n',
    'BEGIN:VEVENT\r\n',
    'DTSTART;TZID=Asia/Jerusalem:20260920T',
    'DTEND;TZID=Asia/Jerusalem:20260920T',
    'SUMMARY:',
    'LOCATION:',
    'DESCRIPTION:',
    'URL:',
    'END:VEVENT\r\n',
    'END:VCALENDAR\r\n',
  ]) assert.ok(unfoldedCalendar.includes(expectedField), `שדה ICS חסר: ${expectedField}`);
  assert.match(unfoldedCalendar, /URL:.*[?&]route=n21(?:#[^\r\n]+)?\r\n/);
  assert.doesNotMatch(unfoldedCalendar, /qa-private|[?&](?:note|personal|checklist|recent|q)=/);
  assert.match(unfoldedCalendar, /DESCRIPTION:.*מפת גישה: https:\/\//);
  assert.match(await page.locator('#calendarStatus').textContent(), /קובץ היומן הורד/);
  await page.locator('[data-close-invite]').click();

  await page.locator('[data-view="combinedView"]').first().click();
  assert.equal(await page.locator('#combinedRoutes .combined-item').count(), 1);
  assert.ok((await page.locator('#combinedPreview').textContent()).includes(passTitle));
  const combinedExport = await downloadedHtml(page, () => page.locator('#exportCombined').click());
  assert.match(combinedExport.filename, /2\.5\.0.*\.html$/);
  assert.match(combinedExport.html, /תכנית טיול משולב/);
  assert.ok(combinedExport.html.includes(passTitle));
  assert.match(combinedExport.html, /noindex,nofollow,noarchive,nosnippet/);

  await page.setViewportSize({ width: 360, height: 780 });
  await page.locator('[data-view="routesView"]').first().click();
  await page.locator('#clearFilters').click();
  const mobileOverflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
    routeCardsInsideViewport: [...document.querySelectorAll('#routeGrid .route-card')].every((card) => {
      const rect = card.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= document.documentElement.clientWidth + 1;
    }),
  }));
  assert.ok(mobileOverflow.document <= 1 && mobileOverflow.body <= 1, JSON.stringify(mobileOverflow));
  assert.equal(mobileOverflow.routeCardsInsideViewport, true, JSON.stringify(mobileOverflow));
  await page.locator(`#routeGrid [data-route-id="${PASS_ROUTE_ID}"] [data-open-route]`).first().click();
  const dialogOverflow = await page.locator('#routeDialog').evaluate((node) => node.scrollWidth - node.clientWidth);
  const dialogBounds = await page.locator('#routeDialog').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, viewport: document.documentElement.clientWidth };
  });
  assert.ok(dialogOverflow <= 1, `גלישה אופקית בדיאלוג: ${dialogOverflow}`);
  assert.ok(dialogBounds.left >= -1 && dialogBounds.right <= dialogBounds.viewport + 1, JSON.stringify(dialogBounds));
  if (WRITE) {
    fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
    await page.screenshot({ path: path.join(ROOT, 'reports', 'browser-mobile-2.5.0.png'), fullPage: false });
  }
  await page.locator('[data-close-dialog]').click();

  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    return { scope: ready.scope, active: ready.active?.state, scriptURL: ready.active?.scriptURL };
  });
  assert.equal(registration.active, 'activated');
  assert.match(registration.scriptURL, /\/sw\.js$/);
  const cacheInfo = await page.evaluate(async () => {
    const keys = await caches.keys();
    const activeKey = keys.find((key) => key === 'ilan-roadbook-v250-build-1');
    const requests = activeKey ? await caches.open(activeKey).then((cache) => cache.keys()) : [];
    return { keys, activeKey, urls: requests.map((request) => request.url) };
  });
  assert.equal(cacheInfo.activeKey, 'ilan-roadbook-v250-build-1');
  for (const expected of [
    'manifest-2.5.0.webmanifest', 'offline-2.5.0.html', 'assets/app-v2.5.0.css',
    'assets/app-v2.5.0.js', 'data/config-v2.5.0.js', 'data/route-expansion-v2.3.0.js',
    'data/release-audit-v2.3.0.js',
  ]) {
    assert.ok(cacheInfo.urls.some((url) => new URL(url).pathname.endsWith(expected)), `חסר במטמון: ${expected}`);
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await acceptDisclaimer(page);
  await waitForCatalog(page);
  assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  const appManifest = await cdp.send('Page.getAppManifest');
  assert.deepEqual(appManifest.errors || [], []);
  const installability = await cdp.send('Page.getInstallabilityErrors');
  const installabilityErrors = installability.installabilityErrors || [];
  const actionableInstallabilityErrors = installabilityErrors.filter((item) => item.errorId !== 'in-incognito');
  assert.deepEqual(actionableInstallabilityErrors, []);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.match(await page.title(), /2\.5\.0/);
  assert.equal(await page.locator('#statRoutes').textContent(), '90');
  assert.equal(await page.evaluate(() => window.ROAD_BOOK_RELEASE_AUDIT?.version), CATALOG_VERSION);
  await context.setOffline(false);

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  const result = {
    document_title: 'בדיקת דפדפן מקצה לקצה',
    document_version: DOCUMENT_VERSION,
    product_version: VERSION,
    catalog_version: CATALOG_VERSION,
    tested_url: URL_UNDER_TEST,
    pass_routes: 90,
    warning_routes: 90,
    filters: {
      north: northCount,
      snake: snakeCount,
      half_day: halfDayCount,
      calm: calmCount,
      day_short_sort: true,
      day_long_sort: true,
      personal_ridden: true,
    },
    picker: { pass_only: true, selected_route_id: pickerRouteId },
    personal_planning: { status: 'ridden', note_persisted: true, local_only: true },
    deep_links: deepLinks,
    recent_routes: recentRoutes,
    route_comparison: comparison,
    filter_sharing: filterSharing,
    freshness_badges: freshness,
    compact_layout: compactLayout,
    departure_checklist: departureChecklist,
    enlarged_map: true,
    ready_to_share: { pass: true, warning: true, clipboard: true, direct_link: true },
    warning_severity_counts: {
      minor_navigation: severityCounts[0], conditional: severityCounts[1], major: severityCounts[2],
    },
    clipboard_characters: clipboardText.length,
    navigation_clipboard: {
      pass_characters: passNavigationClipboard.length,
      excluded_characters: excludedNavigationClipboard.length,
      excluded_stop_without_waze: true,
    },
    route_html_export: routeExport.filename,
    combined_html_export: combinedExport.filename,
    warning_html_export: warningExport.filename,
    calendar_export: {
      filename: calendarDownload.filename,
      bytes: calendarDownload.bytes.length,
      crlf_only: true,
      route_link: true,
    },
    invite_secondary_meeting: true,
    connected_routes_visible: true,
    local_visit_counter: true,
    dark_mode_toggle: themeAfter,
    local_ai_helper: true,
    ai_clipboard_tooltip: true,
    excluded_navigation_stop: excludedNavigation,
    mobile_overflow: mobileOverflow,
    dialog_overflow: dialogOverflow,
    service_worker: registration,
    cache: cacheInfo,
    manifest_errors: appManifest.errors || [],
    installability_errors: installabilityErrors,
    actionable_installability_errors: actionableInstallabilityErrors,
    installability_environment_note: installabilityErrors.some((item) => item.errorId === 'in-incognito')
      ? 'בדיקת Chrome אוטומטית רצה בפרופיל זמני/Incognito; זו מגבלת סביבת הבדיקה ולא שגיאת PWA.'
      : '',
    offline_reload: true,
    page_errors: pageErrors,
    console_errors: consoleErrors,
    passed: true,
  };
  if (WRITE) {
    fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'reports', 'browser-qa-2.5.0.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(result));
  await browser.close();
  activeBrowser = null;
}

main().catch(async (error) => {
  console.error(error);
  try { await activeBrowser?.close(); } catch { /* שגיאת הבדיקה המקורית היא הקובעת. */ }
  activeBrowser = null;
  process.exitCode = 1;
});
