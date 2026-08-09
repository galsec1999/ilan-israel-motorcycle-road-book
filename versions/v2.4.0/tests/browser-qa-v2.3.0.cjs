/**
 * בדיקת דפדפן מקצה לקצה — גרסת מסמך 2.3.0
 * גרסת מוצר: 2.3.0
 *
 * הרצה: הגדרת NODE_PATH לספריות סביבת Codex ואז:
 * node tests/browser-qa-v2.3.0.cjs http://127.0.0.1:4179/ --write
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const VERSION = '2.3.0';
const ROOT = path.resolve(__dirname, '..');
const URL_UNDER_TEST = process.argv.find((arg) => /^https?:\/\//.test(arg)) || 'http://127.0.0.1:4179/';
const WRITE = process.argv.includes('--write');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function acceptDisclaimer(page) {
  const dialog = page.locator('#disclaimerDialog');
  if (await dialog.evaluate((node) => node.open).catch(() => false)) {
    await page.locator('#acceptDisclaimer').check();
    await page.locator('#confirmDisclaimer').click();
  }
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

async function main() {
  assert.ok(fs.existsSync(CHROME), `Chrome לא נמצא: ${CHROME}`);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({
    locale: 'he-IL',
    viewport: { width: 1280, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/google|maps|favicon|Failed to load resource|ERR_/i.test(message.text())) consoleErrors.push(message.text());
  });

  await page.goto(URL_UNDER_TEST, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await acceptDisclaimer(page);
  await page.waitForFunction(() => document.querySelector('#statRoutes')?.textContent !== '—');
  assert.match(await page.title(), /2\.3\.0/);
  assert.equal(await page.locator('#statRoutes').textContent(), '90');
  assert.equal(await page.locator('#statIssueRoutes').textContent(), '90');
  assert.equal(await page.locator('#issueTabCount').textContent(), '90');
  assert.equal(await page.locator('#routeGrid .route-card').count(), 90);
  assert.match(await page.locator('[data-star-count="all"]').textContent(), /90 ב־PASS · 90 עם הערה/);
  assert.match(await page.locator('#visitCountLabel').textContent(), /כניסות במכשיר זה/);
  assert.ok(Number(await page.locator('#visitCount').textContent()) >= 1);

  const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme || 'system');
  await page.locator('#themeToggle').click();
  const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme);
  assert.notEqual(themeAfter, themeBefore);
  assert.equal(await page.evaluate(() => localStorage.getItem(window.ROAD_BOOK_CONFIG.themeKey)), themeAfter);

  await page.locator('[data-quick="loop"]').click();
  const loopCount = await page.locator('#routeGrid .route-card').count();
  assert.ok(loopCount >= 24, `מסנן לולאה/נחש החזיר רק ${loopCount} מסלולי PASS`);
  await page.locator('#clearFilters').click();
  await page.locator('[data-quick="radial"]').click();
  const radialCount = await page.locator('#routeGrid .route-card').count();
  assert.equal(loopCount + radialCount, 90, `מסנני מבנה אינם מחלקים את כל 90 מסלולי ה־PASS: ${loopCount}+${radialCount}`);
  await page.locator('#clearFilters').click();

  const firstPassCard = page.locator('#routeGrid [data-route-id="n21"]');
  assert.equal(await firstPassCard.count(), 1);
  await firstPassCard.locator('[data-open-route]').first().click();
  await page.locator('#routeDialog').waitFor({ state: 'visible' });
  const firstPassTitle = await page.locator('#routeDialogTitle').textContent();
  assert.ok(await page.locator('#routeDialog a', { hasText: 'מסלול מלא מהמרכז' }).count());
  assert.ok(await page.locator('#routeDialog a', { hasText: 'הציר הנופי בלבד' }).count());
  assert.match(await page.locator('#routeDialogContent').textContent(), /לולאה — חזרה בציר אחר/);
  assert.ok(await page.locator('#routeDialog .connection-grid .info-card').count() >= 1);

  const routeExport = await downloadedHtml(page, () =>
    page.locator('#routeDialog [data-export-route="n21"]').click());
  assert.match(routeExport.filename, /2\.3\.0.*\.html$/);
  assert.ok(routeExport.html.includes(firstPassTitle));
  assert.match(routeExport.html, /noindex,nofollow,noarchive,nosnippet/);
  assert.match(routeExport.html, /נקודות מפגש והצטרפות/);
  assert.match(routeExport.html, /המשך טבעי למסלולים נוספים/);

  await page.locator('#routeDialog [data-add-combined="n21"]').click();
  assert.match(await page.locator('#routeDialog [data-add-combined="n21"]').textContent(), /נוסף/);

  const copyButton = page.locator('#routeDialog [data-copy-stop-ai]').first();
  await copyButton.click();
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(clipboardText, /נקודת העניין:/);
  assert.match(clipboardText, /מקורות/);
  assert.match(await copyButton.getAttribute('title'), /Paste|הדבקה/);

  await page.locator('#routeDialog [data-invite="n21"]').first().click();
  await page.locator('#inviteDialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#meetingSecondaryEnabled').isChecked(), true);
  const invitePreview = await page.locator('#invitePreview').inputValue();
  assert.ok(invitePreview.includes(firstPassTitle));
  assert.match(invitePreview, /יציאה מאזור המרכז/);
  assert.match(invitePreview, /נקודת הצטרפות בדרך/);
  assert.match(invitePreview, /מפגש משוער \d{2}:\d{2} \| יציאה \d{2}:\d{2}/);
  await page.locator('#inviteDialog [data-close-invite]').click();

  await page.locator('[data-view="combinedView"]').first().click();
  assert.equal(await page.locator('#combinedRoutes .combined-item').count(), 1);
  assert.ok((await page.locator('#combinedPreview').textContent()).includes(firstPassTitle));
  const combinedExport = await downloadedHtml(page, () => page.locator('#exportCombined').click());
  assert.match(combinedExport.html, /תכנית טיול משולב/);
  assert.ok(combinedExport.html.includes(firstPassTitle));
  assert.match(combinedExport.html, /noindex,nofollow,noarchive,nosnippet/);

  await page.locator('[data-view="issuesView"]').first().click();
  assert.equal(await page.locator('#issueRouteGrid .route-card').count(), 90);
  assert.equal(Number(await page.locator('#issueSeverityCountAll').textContent()), 90);
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
    for (const route of window.ROAD_BOOK_V23_EXPANSION?.routes || []) {
      const stop = (route.stops || []).find((item) => item.navigation_excluded);
      if (stop) return { routeId: route.id, stopName: stop.name, reason: stop.navigation_exclusion_reason };
    }
    return null;
  });
  assert.ok(excludedNavigation, 'לא נמצא מסלול אזהרה עם נקודה תיעודית שהוחרגה מן הניווט');
  const excludedCard = page.locator(`#issueRouteGrid [data-route-id="${excludedNavigation.routeId}"]`);
  await excludedCard.locator('[data-open-route]').first().click();
  await page.locator('#routeDialog').waitFor({ state: 'visible' });
  const excludedStopCard = page.locator('#routeDialog .stop-card').filter({ hasText: excludedNavigation.stopName });
  assert.equal(await excludedStopCard.count(), 1);
  assert.match(await excludedStopCard.locator('.navigation-exclusion-note').textContent(), /אינה כלולה בניווט/);
  assert.equal(await excludedStopCard.locator('a', { hasText: 'Waze' }).count(), 0);
  assert.ok((await excludedStopCard.textContent()).includes(excludedNavigation.reason.slice(0, 18)));
  const warningExport = await downloadedHtml(page, () =>
    page.locator(`#routeDialog [data-export-route="${excludedNavigation.routeId}"]`).click());
  assert.ok(warningExport.html.includes(excludedNavigation.reason));
  assert.match(warningExport.html, /נקודה תיעודית — אינה כלולה בניווט/);
  await page.locator('#routeDialog [data-close-dialog]').click();

  await page.setViewportSize({ width: 360, height: 780 });
  await page.locator('[data-view="routesView"]').first().click();
  await page.locator('#clearFilters').click();
  const mobileOverflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  assert.ok(mobileOverflow.document <= 1 && mobileOverflow.body <= 1, JSON.stringify(mobileOverflow));
  await page.locator('#routeGrid [data-open-route]').first().click();
  const dialogOverflow = await page.locator('#routeDialog').evaluate((node) => node.scrollWidth - node.clientWidth);
  assert.ok(dialogOverflow <= 1, `גלישה אופקית בדיאלוג: ${dialogOverflow}`);
  await page.screenshot({ path: path.join(ROOT, 'reports', 'browser-mobile-2.3.0.png'), fullPage: false });
  await page.locator('#routeDialog [data-close-dialog]').click();

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  assert.equal(manifestHref, './manifest-2.3.0.webmanifest');
  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    return { scope: ready.scope, active: ready.active?.state };
  });
  assert.equal(registration.active, 'activated');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await acceptDisclaimer(page);
  assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  const appManifest = await cdp.send('Page.getAppManifest');
  assert.deepEqual(appManifest.errors || [], []);
  const installability = await cdp.send('Page.getInstallabilityErrors');
  const installabilityErrors = installability.installabilityErrors || [];
  const actionableInstallabilityErrors = installabilityErrors
    .filter((item) => item.errorId !== 'in-incognito');
  assert.deepEqual(actionableInstallabilityErrors, []);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.match(await page.title(), /2\.3\.0/);
  assert.equal(await page.locator('#statRoutes').textContent(), '90');
  await context.setOffline(false);

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  const result = {
    document_title: 'בדיקת דפדפן מקצה לקצה',
    document_version: VERSION,
    product_version: VERSION,
    tested_url: URL_UNDER_TEST,
    pass_routes: 90,
    warning_routes: 90,
    loop_filter_result: loopCount,
    direct_filter_result: radialCount,
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
    excluded_navigation_stop: excludedNavigation,
    mobile_overflow: mobileOverflow,
    dialog_overflow: dialogOverflow,
    service_worker: registration,
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
    fs.writeFileSync(path.join(ROOT, 'reports', 'browser-qa-2.3.0.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(result));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
