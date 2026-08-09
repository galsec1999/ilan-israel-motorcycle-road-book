/**
 * ביקורת שחרור פרטנית למסלולים
 * גרסה: 2.2.1
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DIR = path.join(ROOT, 'reports');
const VERSION = '2.2.1';
const INSTRUCTIONAL_LOCATION = /\s\/\s|\sאו\s|רק אם|חניה בלבד|בהתאם להנחיות|מבחוץ|נקודת מורשת|אזור תצפית מותר|נקודת יציאה צפונית|נקודת תדריך/;
const PLACEHOLDER = /טרם|לחישוב|יתועד לאחר|לא אומת|מועמד באימות/;

async function loadWindowData() {
  const context = vm.createContext({ window: {} });
  for (const relative of [
    'data/legacy-content-v2.js',
    'data/new-routes-v2.js',
    'data/release-audit-v2.js',
  ]) {
    vm.runInContext(await readFile(path.join(ROOT, relative), 'utf8'), context, { filename: relative });
  }
  return context.window;
}

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function orderedPoints(values = []) {
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((point, index, points) => index === 0 || point !== points[index - 1]);
}

function applyRelease(route, audit) {
  const override = audit.route_overrides?.[route.id] || {};
  const excludedStops = new Set(audit.stop_exclusions?.[route.id] || []);
  const stopNavigation = audit.stop_navigation?.[route.id] || {};
  const pointToPoint = new Set(audit.point_to_point_corrections || []);
  const sources = audit.source_overrides?.[route.id] || override.sources || route.sources || [];
  const stops = (route.stops || [])
    .filter((stop) => !excludedStops.has(stop.name))
    .map((stop) => ({
      ...stop,
      ...(Object.hasOwn(stopNavigation, stop.name) ? { navigation_name: stopNavigation[stop.name] } : {}),
    }));
  return {
    ...route,
    ...override,
    stops,
    sources: [...new Set(sources.map(httpsUrl).filter(Boolean))],
    road_profile: override.road_profile
      ? { ...(route.road_profile || {}), ...override.road_profile }
      : route.road_profile,
    route_shape: pointToPoint.has(route.id) ? 'נקודה לנקודה' : (override.route_shape || route.route_shape),
    map_points: audit.navigation_points?.[route.id] || override.map_points || route.map_points,
  };
}

function navigationPoints(route) {
  if (Array.isArray(route.map_points) && route.map_points.length >= 2) return orderedPoints(route.map_points);
  return orderedPoints([
    route.start,
    ...(route.stops || []).map((stop) => stop.navigation_name === null ? '' : (stop.navigation_name || stop.name)),
    route.end,
  ]);
}

function googleMapsUrl(points) {
  const params = new URLSearchParams({
    api: '1',
    origin: `${points[0]}, ישראל`,
    destination: `${points.at(-1)}, ישראל`,
    travelmode: 'driving',
  });
  const waypoints = points.slice(1, -1);
  if (waypoints.length) params.set('waypoints', waypoints.map((point) => `${point}, ישראל`).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function profileTotal(profile = {}) {
  return ['fast', 'twisty', 'local', 'urban', 'gravel']
    .reduce((sum, key) => sum + (Number(profile[key]) || 0), 0);
}

function requiredFields(route) {
  const fields = ['title', 'region', 'area', 'duration', 'km', 'level', 'start', 'end', 'roads', 'best', 'summary', 'cautions', 'fuel', 'verification_level', 'route_shape'];
  return fields.filter((field) => typeof route[field] !== 'string' || route[field].trim() === '');
}

function staticChecks(route, allLegacyIds) {
  const points = navigationPoints(route);
  const mapUrl = googleMapsUrl(points);
  const missing = requiredFields(route);
  const placeholders = ['duration', 'km', 'roads', 'fuel', 'summary']
    .filter((field) => PLACEHOLDER.test(String(route[field] || '')));
  const sourceLinks = route.sources || [];
  const connectionErrors = (route.connections || []).filter((id) => !allLegacyIds.has(id));
  const circleMatches = route.route_shape !== 'מעגלי' || points[0] === points.at(-1);
  return {
    required_fields: missing.length === 0,
    missing_fields: missing,
    no_placeholders: placeholders.length === 0,
    placeholder_fields: placeholders,
    stops_present: Array.isArray(route.stops) && route.stops.length >= 2,
    stop_content_complete: (route.stops || []).every((stop) => stop.name && stop.kind && Number.isFinite(Number(stop.minutes)) && (stop.story_long || stop.story)),
    sources_https: sourceLinks.length > 0 && sourceLinks.every((url) => Boolean(httpsUrl(url))),
    sources_unique: sourceLinks.length === new Set(sourceLinks).size,
    connections_valid: connectionErrors.length === 0,
    connection_errors: connectionErrors,
    road_profile_100: profileTotal(route.road_profile) === 100,
    road_profile_total: profileTotal(route.road_profile),
    map_has_origin_and_destination: points.length >= 2,
    map_waypoints_within_limit: Math.max(0, points.length - 2) <= 8,
    map_waypoint_count: Math.max(0, points.length - 2),
    map_url_under_2048: mapUrl.length <= 2048,
    map_url_length: mapUrl.length,
    map_api_1: new URL(mapUrl).searchParams.get('api') === '1',
    map_points_unambiguous: points.every((point) => !INSTRUCTIONAL_LOCATION.test(point)),
    circle_matches_points: circleMatches,
    navigation_points: points,
    map_url: mapUrl,
  };
}

function checksPassed(checks) {
  return [
    'required_fields', 'no_placeholders', 'stops_present', 'stop_content_complete',
    'sources_https', 'sources_unique', 'connections_valid', 'road_profile_100',
    'map_has_origin_and_destination', 'map_waypoints_within_limit', 'map_url_under_2048',
    'map_api_1', 'map_points_unambiguous', 'circle_matches_points',
  ].every((name) => checks[name] === true);
}

async function checkSource(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/127 Safari/537.36' },
    });
    return { url, ok: response.ok, status: response.status, final_url: response.url };
  } catch (error) {
    return { url, ok: false, status: 0, error: error?.cause?.code || error.name || 'fetch_failed' };
  } finally {
    clearTimeout(timeout);
  }
}

async function sourceHealth(routes) {
  const urls = [...new Set(routes.flatMap((route) => route.sources || []))];
  const results = [];
  for (let index = 0; index < urls.length; index += 6) {
    results.push(...await Promise.all(urls.slice(index, index + 6).map(checkSource)));
  }
  return Object.fromEntries(results.map((result) => [result.url, result]));
}

function candidateRecord(spec) {
  return {
    id: `v2-${spec.id}`,
    title: spec.title,
    origin: 'research_candidate',
    release_status: 'withheld',
    release_reason: 'מועמד מחקר לא גמור: חסרים מרחק, זמן, כבישים, תדלוק, תוכן מלא ובדיקת דרך.',
    checks: {
      required_fields: false,
      no_placeholders: false,
      map_rendered_in_2_2_0: true,
      geographic_resolution_verified: false,
    },
    source_urls: spec.sources || [],
    navigation_points: spec.points || [],
  };
}

export async function buildAudit({ network = false } = {}) {
  const data = await loadWindowData();
  const audit = data.ROAD_BOOK_RELEASE_AUDIT;
  const withheld = new Set(audit.withheld_legacy_route_ids || []);
  const ready = new Set(audit.release_ready_route_ids || []);
  const allLegacyIds = new Set(data.ROAD_BOOK_LEGACY.routes.map((route) => route.id));
  const legacyRoutes = data.ROAD_BOOK_LEGACY.routes.map((route) => applyRelease(route, audit));
  const activeRoutes = legacyRoutes.filter((route) => ready.has(route.id) && !withheld.has(route.id));
  const health = network ? await sourceHealth(activeRoutes) : {};
  const exclusionById = new Map((audit.catalogue_exclusions || [])
    .filter((item) => item.route_id)
    .map((item) => [item.route_id, item]));

  const legacyRecords = legacyRoutes.map((route) => {
    const checks = staticChecks(route, allLegacyIds);
    const sourceResults = (route.sources || []).map((url) => health[url]).filter(Boolean);
    const sourcesReachable = !network || (sourceResults.length === route.sources.length && sourceResults.every((result) => result.ok));
    const isWithheld = withheld.has(route.id);
    const isReady = ready.has(route.id);
    const staticPass = checksPassed(checks);
    const releaseResult = audit.route_results?.[route.id] || null;
    const releaseStatus = isWithheld
      ? 'withheld'
      : !isReady || !staticPass || !sourcesReachable
        ? 'fail'
        : releaseResult?.status === 'pass'
          ? 'pass'
          : 'reviewing';
    return {
      id: route.id,
      title: route.title,
      origin: 'legacy',
      release_status: releaseStatus,
      release_reason: isWithheld ? (exclusionById.get(route.id)?.reason || 'הוסר מן הקטלוג בשער השחרור.') : '',
      verification_level: route.verification_level,
      checks: { ...checks, sources_reachable: sourcesReachable, ...(releaseResult?.checks || {}) },
      source_urls: route.sources,
      source_results: network ? sourceResults : [],
    };
  });

  const candidateRecords = (data.ROAD_BOOK_V2_CANDIDATES || []).map(candidateRecord);
  const records = [...legacyRecords, ...candidateRecords];
  const summary = {
    total_records: records.length,
    legacy_records: legacyRecords.length,
    candidate_records: candidateRecords.length,
    active_catalogue: activeRoutes.length,
    passed: legacyRecords.filter((record) => record.release_status === 'pass').length,
    reviewing: legacyRecords.filter((record) => record.release_status === 'reviewing').length,
    withheld: records.filter((record) => record.release_status === 'withheld').length,
    failed: records.filter((record) => record.release_status === 'fail').length,
    active_stops: activeRoutes.reduce((sum, route) => sum + route.stops.length, 0),
    unique_active_sources: new Set(activeRoutes.flatMap((route) => route.sources)).size,
  };

  return {
    document_title: 'ביקורת שחרור פרטנית למסלולים',
    document_version: VERSION,
    audited_on: audit.audited_on,
    scope: 'כל 90 מסלולי המקור וכל 53 מועמדי המחקר',
    network_checked: network,
    summary,
    routes: records,
  };
}

function markdownReport(report) {
  const rows = report.routes.map((route) => {
    const checks = route.checks || {};
    const withheld = route.release_status === 'withheld';
    const map = !withheld && checks.map_geography === true && checks.map_render === true ? '✓' : '—';
    const links = withheld ? '—' : (checks.sources_reachable === true ? '✓' : (report.network_checked ? '✗' : '—'));
    const data = checks.required_fields && checks.no_placeholders ? '✓' : '✗';
    const reason = route.release_reason ? ` — ${route.release_reason}` : '';
    return `| \`${route.id}\` | ${route.title} | ${route.release_status}${reason} | ${data} | ${map} | ${links} |`;
  }).join('\n');
  return `# ביקורת שחרור פרטנית למסלולים — גרסה ${VERSION}\n\n` +
    `מועד ביקורת: ${report.audited_on}. היקף: ${report.scope}.\n\n` +
    `## סיכום\n\n` +
    `- ${report.summary.total_records} רשומות נבדקו בנפרד.\n` +
    `- ${report.summary.active_catalogue} מסלולים נכללים ברשימת ההיתר של הקטלוג.\n` +
    `- ${report.summary.passed} מסלולים עברו את כל שערי השחרור; ${report.summary.reviewing} עדיין בבדיקה.\n` +
    `- ${report.summary.withheld} רשומות הועברו להסגר או למחקר בלבד.\n` +
    `- ${report.summary.failed} מסלולי מקור פעילים נכשלו בשער הסטטי.\n` +
    `- ${report.summary.active_stops} תחנות נכללות בקטלוג הפעיל.\n\n` +
    `## תוצאה לכל מסלול\n\n` +
    `| מזהה | מסלול | סטטוס | נתונים | מפה | מקורות |\n` +
    `|---|---|---|---:|---:|---:|\n${rows}\n\n` +
    `## פירוש השער\n\n` +
    `PASS טכני מאשר מבנה, רצף ניווט, טעינת מפה, קישורים ותצוגה. הוא אינו הבטחה שמצב הכביש, מזג האוויר או הנחיות הביטחון לא השתנו לאחר מועד הביקורת.\n`;
}

async function main() {
  const write = process.argv.includes('--write');
  const network = process.argv.includes('--network');
  const report = await buildAudit({ network });
  if (write) {
    await mkdir(REPORT_DIR, { recursive: true });
    await writeFile(path.join(REPORT_DIR, 'route-release-audit-2.2.1.json'), `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(path.join(REPORT_DIR, 'ROUTE_RELEASE_AUDIT_2_2_1.md'), markdownReport(report));
  }
  console.log(JSON.stringify(report.summary));
  if (report.summary.failed > 0 || report.summary.reviewing > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
