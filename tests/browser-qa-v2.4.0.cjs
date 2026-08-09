/**
 * בדיקת דפדפן מקצה לקצה — גרסת מסמך 2.4.0
 * גרסת מוצר: 2.4.0
 * גרסת קטלוג מסלולים: 2.3.0
 *
 * הרצה: הגדרת NODE_PATH לספריות סביבת Codex ואז:
 * node tests/browser-qa-v2.4.0.cjs http://127.0.0.1:4179/ --write
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const VERSION = '2.4.0';
const CATALOG_VERSION = '2.3.0';
const PASS_ROUTE_ID = 'n21';
const FALLBACK_WARNING_ROUTE_ID = 'r002';
const PERSONAL_NOTE = 'בדיקת QA אישית — נשמר מקומית ומתמיד לאחר רענון';
const ROOT = path.resolve(__dirname, '..');
const URL_UNDER_TEST = process.argv.find((arg) => /^https?:\/\//.test(arg)) || 'http://127.0.0.1:4179/';
const WRITE = process.argv.includes('--write');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

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

async function downloadedHtml(page, action) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    action(),
  ]);
  const downloadedPath = await download.path();
  assert.ok(downloadedPath, `לא התקבל נתיב להורדה: ${download.suggestedFilename()}`);
  return {
    filename: download.suggestedFilename(),
    html: fs.readFileSync(downloadedPath, 'utf8'),
  };
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
  await invalidPage.goto(appUrl({ route: 'missing-route-240', hash: 'routesView' }), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForCatalog(invalidPage);
  await acceptDisclaimer(invalidPage);
  assert.equal(await invalidPage.locator('#routeDialog').evaluate((node) => node.open), false);
  assert.equal(new URL(invalidPage.url()).searchParams.has('route'), false);
  assert.equal(await invalidPage.locator('#routeGrid .route-card').count(), 90);
  result.invalid = true;
  await invalidPage.close();

  return result;
}

async function main() {
  assert.ok(fs.existsSync(CHROME), `Chrome לא נמצא: ${CHROME}`);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
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
  assert.match(assets.title, /2\.4\.0/);
  assert.equal(assets.lang, 'he');
  assert.equal(assets.dir, 'rtl');
  assert.equal(assets.manifest, './manifest-2.4.0.webmanifest');
  assert.ok(assets.styles.includes('./assets/app-v2.4.0.css'));
  assert.ok(assets.scripts.includes('./data/config-v2.4.0.js'));
  assert.ok(assets.scripts.includes('./assets/app-v2.4.0.js'));
  assert.ok(assets.scripts.includes('./data/route-expansion-v2.3.0.js'));
  assert.ok(assets.scripts.includes('./data/release-audit-v2.3.0.js'));
  assert.equal(assets.configVersion, VERSION);
  assert.equal(assets.releaseAuditVersion, CATALOG_VERSION);
  assert.equal(assets.expansionVersion, CATALOG_VERSION);

  const fetchedAssets = await page.evaluate(async () => {
    const [manifest, config, serviceWorker] = await Promise.all([
      fetch('./manifest-2.4.0.webmanifest').then((response) => response.json()),
      fetch('./data/config-v2.4.0.js').then((response) => response.text()),
      fetch('./sw.js').then((response) => response.text()),
    ]);
    return { manifest, config, serviceWorker };
  });
  assert.equal(fetchedAssets.manifest.version, VERSION);
  assert.match(fetchedAssets.manifest.name, /2\.4\.0/);
  assert.match(fetchedAssets.config, /version:\s*'2\.4\.0'/);
  assert.match(fetchedAssets.serviceWorker, /v2\.4\.0-build-1/);
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
  assert.match(readyPass, /ספר הטיולים של אילן · גרסה 2\.4\.0/);
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
  const warningExport = await downloadedHtml(page, () =>
    page.locator(`#routeDialog [data-export-route="${excludedNavigation.routeId}"]`).click());
  assert.match(warningExport.filename, /2\.4\.0.*\.html$/);
  assert.ok(warningExport.html.includes(excludedNavigation.reason));
  assert.match(warningExport.html, /נקודה תיעודית — אינה כלולה בניווט/);
  await page.locator('[data-close-dialog]').click();

  await page.locator('[data-view="routesView"]').first().click();
  await page.locator(`#routeGrid [data-route-id="${PASS_ROUTE_ID}"] [data-open-route]`).first().click();
  const passTitle = await page.locator('#routeDialogTitle').textContent();
  assert.ok(await page.locator('#routeDialog a', { hasText: 'מסלול מלא מהמרכז' }).count());
  assert.ok(await page.locator('#routeDialog a', { hasText: 'הציר הנופי בלבד' }).count());
  assert.match(await page.locator('#routeDialogContent').textContent(), /נקודות מפגש והצטרפות/);
  assert.ok(await page.locator('#routeDialog .connection-grid .info-card').count() >= 1);

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
  assert.match(routeExport.filename, /2\.4\.0.*\.html$/);
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
  await page.locator('[data-close-invite]').click();

  await page.locator('[data-view="combinedView"]').first().click();
  assert.equal(await page.locator('#combinedRoutes .combined-item').count(), 1);
  assert.ok((await page.locator('#combinedPreview').textContent()).includes(passTitle));
  const combinedExport = await downloadedHtml(page, () => page.locator('#exportCombined').click());
  assert.match(combinedExport.filename, /2\.4\.0.*\.html$/);
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
    await page.screenshot({ path: path.join(ROOT, 'reports', 'browser-mobile-2.4.0.png'), fullPage: false });
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
    const activeKey = keys.find((key) => key === 'ilan-roadbook-live-v2.4.0-build-1');
    const requests = activeKey ? await caches.open(activeKey).then((cache) => cache.keys()) : [];
    return { keys, activeKey, urls: requests.map((request) => request.url) };
  });
  assert.equal(cacheInfo.activeKey, 'ilan-roadbook-live-v2.4.0-build-1');
  for (const expected of [
    'manifest-2.4.0.webmanifest', 'offline-2.4.0.html', 'assets/app-v2.4.0.css',
    'assets/app-v2.4.0.js', 'data/config-v2.4.0.js', 'data/route-expansion-v2.3.0.js',
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
  assert.match(await page.title(), /2\.4\.0/);
  assert.equal(await page.locator('#statRoutes').textContent(), '90');
  assert.equal(await page.evaluate(() => window.ROAD_BOOK_RELEASE_AUDIT?.version), CATALOG_VERSION);
  await context.setOffline(false);

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  const result = {
    document_title: 'בדיקת דפדפן מקצה לקצה',
    document_version: VERSION,
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
    enlarged_map: true,
    ready_to_share: { pass: true, warning: true, clipboard: true, direct_link: true },
    warning_severity_counts: {
      minor_navigation: severityCounts[0], conditional: severityCounts[1], major: severityCounts[2],
    },
    clipboard_characters: clipboardText.length,
    route_html_export: routeExport.filename,
    combined_html_export: combinedExport.filename,
    warning_html_export: warningExport.filename,
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
    fs.writeFileSync(path.join(ROOT, 'reports', 'browser-qa-2.4.0.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(result));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
