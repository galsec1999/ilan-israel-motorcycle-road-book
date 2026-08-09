/**
 * ביקורת שחרור פרטנית למסלולים
 * גרסת מסמך: 2.3.1
 * גרסת מוצר: 2.3.0
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DIR = path.join(ROOT, 'reports');
const VERSION = '2.3.0';
const WARNING_SEVERITIES = Object.freeze({
  minor_navigation: {
    label: 'תיקון ניווט קטן',
    explanation: 'המסלול עצמו נשאר שימושי, אך נקודת עניין, שם מקום או קישור ניווט דורשים תיקון או תשומת לב.',
  },
  conditional: {
    label: 'מסלול מותנה',
    explanation: 'אפשר לשקול את המסלול רק אם התנאי המודגש מתקיים, או לאחר דילוג מודע על נקודה שאינה משנה את ליבת הטיול.',
  },
  major: {
    label: 'בעיה מהותית',
    explanation: 'נדרש שינוי משמעותי במסלול או חלופה בדוקה לפני יציאה; הבעיה עשויה לגעת בליבת הדרך, בגישה או בהתאמת המפה.',
  },
});

// אתרים רשמיים אלה נבדקו גם בדפדפן אך מחזירים 401/403 לבודקי HTTP אוטומטיים.
// הסטטוס נשמר בדוח כ-access_controlled ואינו מוסווה כ-HTTP 200.
const OFFICIAL_BROWSER_VERIFIED_WAF_HOSTS = new Set([
  'www.parks.org.il',
  'parks.org.il',
  'www.anumuseum.org.il',
  'www.neot-kedumim.org.il',
  'www.nli.org.il',
  'www.gov.il',
  'izkor.gov.il',
  'www.izkor.gov.il',
]);
const INSTRUCTIONAL_LOCATION = /\s\/\s|\sאו\s|רק אם|חניה בלבד|בהתאם להנחיות|מבחוץ|נקודת מורשת|אזור תצפית מותר|נקודת יציאה צפונית|נקודת תדריך/;
const PLACEHOLDER = /טרם|לחישוב|יתועד לאחר|לא אומת|מועמד באימות/;

async function loadWindowData() {
  const context = vm.createContext({ window: {} });
  for (const relative of [
    'data/legacy-content-v2.js',
    'data/new-routes-v2.js',
    `data/route-expansion-v${VERSION}.js`,
    `data/release-audit-v${VERSION}.js`,
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
  // במסלול אזהרה ייתכן יעד רכיבה בטוח יחיד, כשיתר תחנות התוכן מוחרגות
  // במפורש להליכה. במקרה כזה אין להמציא יעד נהיגה שני רק לצורך הביקורת.
  if (Array.isArray(route.map_points) && route.map_points.length >= 1) return orderedPoints(route.map_points);
  return orderedPoints([
    route.start,
    ...(route.stops || []).map((stop) => stop.navigation_name === null ? '' : (stop.navigation_name || stop.name)),
    route.end,
  ]);
}

const MEETING_HUBS = Object.freeze({
  north: Object.freeze({ name: 'חניון רידינג מזרח, תל אביב', lat: 32.0998202, lon: 34.7809780 }),
  center: Object.freeze({ name: 'תחנת דלק היובל, משה דיין 10, חולון', lat: 32.0012040, lon: 34.7632800 }),
  southCoast: Object.freeze({ name: 'יס פלאנט ראשון לציון', lat: 31.9797548, lon: 34.7476658 }),
  south: Object.freeze({ name: 'תחנת דלק פז גדרה, כביש 40', lat: 31.8065710, lon: 34.7659320 }),
});

function defaultMeetingHub(route) {
  if (route.meeting_primary) return {
    name: route.meeting_primary,
    lat: Number(route.meeting_primary_coordinates?.lat),
    lon: Number(route.meeting_primary_coordinates?.lon),
  };
  const text = `${route.region || ''} ${route.area || ''} ${route.start || ''}`;
  if (/דרום|נגב|ערבה|אילת|באר שבע|מצפה רמון|ירוחם|דימונה|ערד/.test(text)) return MEETING_HUBS.south;
  if (/אשדוד|אשקלון|חוף דרומי/.test(text)) return MEETING_HUBS.southCoast;
  if (/צפון|גליל|גולן|כנרת|חיפה|כרמל|עכו|נהריה|עמק יזרעאל|בית שאן|החולה/.test(text)) return MEETING_HUBS.north;
  return MEETING_HUBS.center;
}

function fullNavigationPoints(route) {
  if (Array.isArray(route.full_map_points) && route.full_map_points.length >= 2) {
    return orderedPoints(route.full_map_points);
  }
  const hub = defaultMeetingHub(route).name;
  const points = orderedPoints([
    hub,
    route.meeting_secondary || route.start,
    ...navigationPoints(route),
    ...(route.return_points || []),
  ]);
  if (['loop', 'snake', 'out_and_back'].includes(route.route_pattern) && points.at(-1) !== hub) points.push(hub);
  return points;
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
  const corePoints = navigationPoints(route);
  const points = fullNavigationPoints(route);
  const mapUrl = googleMapsUrl(points);
  const missing = requiredFields(route);
  const placeholders = ['duration', 'km', 'roads', 'fuel', 'summary']
    .filter((field) => PLACEHOLDER.test(String(route[field] || '')));
  const sourceLinks = route.sources || [];
  const connectionErrors = (route.connections || []).filter((id) => !allLegacyIds.has(id));
  const circleMatches = ['loop', 'snake'].includes(route.route_pattern)
    ? points[0] === points.at(-1)
    : route.route_shape !== 'מעגלי' || corePoints[0] === corePoints.at(-1);
  const hub = defaultMeetingHub(route);
  const hubInsideCentralBand = Number.isFinite(hub.lat) && Number.isFinite(hub.lon)
    && hub.lat >= 31.78 && hub.lat <= 32.12 && hub.lon >= 34.72 && hub.lon <= 34.83;
  const isExpansionRoute = route.catalogue_version === VERSION;
  const coordinatePoints = route.navigation_coordinates || [];
  const excludedStops = (route.stops || []).filter((stop) => stop.navigation_excluded);
  const safeNavigationExclusions = excludedStops.every((stop) =>
    stop.navigation_name === null
    && String(stop.navigation_exclusion_reason || '').trim().length >= 20
    && !corePoints.includes(stop.name)
    && !points.includes(stop.name));
  const stopSourcesComplete = !isExpansionRoute || (route.stops || []).every((stop) =>
    Array.isArray(stop.sources) && stop.sources.length > 0 && stop.sources.every((url) => Boolean(httpsUrl(url))));
  const coordinatesComplete = !isExpansionRoute || (Array.isArray(coordinatePoints)
    && coordinatePoints.length === corePoints.length
    && coordinatePoints.every((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lon))));
  return {
    required_fields: missing.length === 0,
    missing_fields: missing,
    no_placeholders: placeholders.length === 0,
    placeholder_fields: placeholders,
    stops_present: Array.isArray(route.stops) && route.stops.length >= 2,
    stop_content_complete: (route.stops || []).every((stop) => stop.name && stop.kind && Number.isFinite(Number(stop.minutes)) && (stop.story_long || stop.story)),
    sources_https: sourceLinks.length > 0 && sourceLinks.every((url) => Boolean(httpsUrl(url))),
    sources_unique: sourceLinks.length === new Set(sourceLinks).size,
    stop_sources_complete: stopSourcesComplete,
    navigation_coordinates_complete: coordinatesComplete,
    safe_navigation_exclusions: safeNavigationExclusions,
    navigation_exclusion_count: excludedStops.length,
    central_origin_verified: hubInsideCentralBand,
    central_origin: hub,
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
    navigation_points: corePoints,
    full_navigation_points: points,
    map_url: mapUrl,
  };
}

function checksPassed(checks) {
  return [
    'required_fields', 'no_placeholders', 'stops_present', 'stop_content_complete',
    'sources_https', 'sources_unique', 'stop_sources_complete', 'navigation_coordinates_complete', 'safe_navigation_exclusions',
    'central_origin_verified', 'connections_valid', 'road_profile_100',
    'map_has_origin_and_destination', 'map_waypoints_within_limit', 'map_url_under_2048',
    'map_api_1', 'map_points_unambiguous', 'circle_matches_points',
  ].every((name) => checks[name] === true);
}

async function checkSource(url) {
  let lastResult = { url, ok: false, status: 0, error: 'fetch_failed' };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/127 Safari/537.36' },
      });
      const originalUrl = new URL(url);
      const finalUrl = new URL(response.url || url);
      const finalHost = finalUrl.hostname.toLowerCase();
      const accessControlled = [401, 403].includes(response.status) && OFFICIAL_BROWSER_VERIFIED_WAF_HOSTS.has(finalHost);
      const genericPath = (pathname) => /^\/(?:he|en|heb|eng)?\/?$/i.test(pathname || '/');
      const genericRedirect = response.redirected
        && !genericPath(originalUrl.pathname)
        && genericPath(finalUrl.pathname);
      let pageTitle = '';
      let soft404 = false;
      if (response.ok && /(?:text\/html|application\/xhtml\+xml)/i.test(response.headers.get('content-type') || '')) {
        const reader = response.body?.getReader();
        const chunks = [];
        let bytes = 0;
        while (reader && bytes < 65536) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          bytes += value.byteLength;
        }
        if (reader) await reader.cancel().catch(() => {});
        const sample = new TextDecoder('utf-8').decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
        pageTitle = String(sample.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
          .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
        const firstHeading = String(sample.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '')
          .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
        soft404 = /(?:\b404\b|page not found|not found|הדף לא נמצא|העמוד לא נמצא)/i.test(`${pageTitle} ${firstHeading}`);
      }
      lastResult = {
        url,
        ok: (response.ok && !genericRedirect && !soft404) || accessControlled,
        status: response.status,
        final_url: response.url,
        access_controlled: accessControlled,
        generic_redirect: genericRedirect,
        soft_404: soft404,
        page_title: pageTitle,
        verification: accessControlled ? 'official_site_browser_verified_waf' : 'direct_http_content_sample',
        attempts: attempt,
      };
      if (lastResult.ok || (response.status > 0 && response.status < 500 && response.status !== 429)) return lastResult;
    } catch (error) {
      lastResult = { url, ok: false, status: 0, error: error?.cause?.code || error.name || 'fetch_failed', attempts: attempt };
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
  }
  return lastResult;
}

async function sourceHealth(routes) {
  const urls = [...new Set(routes.flatMap((route) => route.sources || []))];
  const hostGroups = new Map();
  for (const url of urls) {
    const host = new URL(url).hostname;
    if (!hostGroups.has(host)) hostGroups.set(host, []);
    hostGroups.get(host).push(url);
  }
  const groups = [...hostGroups.values()];
  const results = [];
  let nextGroup = 0;
  async function worker() {
    while (nextGroup < groups.length) {
      const group = groups[nextGroup];
      nextGroup += 1;
      for (const url of group) results.push(await checkSource(url));
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, groups.length) }, worker));
  return Object.fromEntries(results.map((result) => [result.url, result]));
}

function candidateRecord(spec) {
  return {
    id: `v2-${spec.id}`,
    title: spec.title,
    origin: 'research_candidate',
    release_status: 'research',
    published_tab: null,
    release_reason: 'מועמד מחקר מוסתר ולא גמור: חסרים מרחק, זמן, כבישים, תדלוק, תוכן מלא ובדיקת דרך.',
    warning_severity: null,
    warning_severity_label: '',
    warning_severity_explanation: '',
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

function issueDisplayReason(value = '') {
  const reason = String(value).trim();
  if (!reason) return 'הבעיה שנמצאה: חסר פירוט מספק. אין להשתמש במסלול לפני בדיקה פרטנית.';
  const neutral = reason
    .replace(/^המסלול הוסר(?: זמנית)?(?: מן השחרור| מקטלוג הכביש| מן הקטלוג הפעיל)?\s*/, '')
    .replace(/^:\s*/, '')
    .replace(/^בגלל\s+/, '')
    .replace(/^מפני שהוא\s+/, 'המסלול ')
    .replace(/^מפני ש/, '')
    .replace(/^עד לקבלת אישור מ([^:]+):\s*/, 'טרם התקבל אישור מ$1: ')
    .replace(/^עד אימות אספלט:\s*/, 'האספלט טרם אומת: ');
  return `הבעיה שנמצאה: ${neutral}`;
}

export async function buildAudit({ network = false } = {}) {
  const data = await loadWindowData();
  const audit = data.ROAD_BOOK_RELEASE_AUDIT;
  const withheld = new Set(audit.withheld_legacy_route_ids || []);
  const ready = new Set(audit.release_ready_route_ids || []);
  const catalogueRoutes = [
    ...(data.ROAD_BOOK_LEGACY.routes || []),
    ...(data.ROAD_BOOK_V23_EXPANSION?.routes || []),
  ];
  const allLegacyIds = new Set(catalogueRoutes.map((route) => route.id));
  const legacyRoutes = catalogueRoutes.map((route) => applyRelease(route, audit));
  const activeRoutes = legacyRoutes.filter((route) => ready.has(route.id) && !withheld.has(route.id));
  const warningRoutes = audit.publish_with_warnings
    ? legacyRoutes.filter((route) => withheld.has(route.id))
    : [];
  const warningIds = new Set(warningRoutes.map((route) => route.id));
  const warningSeverity = audit.warning_severity || {};
  const invalidSeverityEntries = Object.entries(warningSeverity)
    .filter(([id, severity]) => !warningIds.has(id) || !Object.hasOwn(WARNING_SEVERITIES, severity));
  const missingSeverityIds = [...warningIds].filter((id) => !Object.hasOwn(warningSeverity, id));
  if (invalidSeverityEntries.length || missingSeverityIds.length) {
    const invalid = invalidSeverityEntries.map(([id, severity]) => `${id}:${severity}`).join(', ') || 'אין';
    const missing = missingSeverityIds.join(', ') || 'אין';
    throw new Error(`מיפוי קטגוריות האזהרה אינו שלם. חסרים: ${missing}; ערכים לא תקינים: ${invalid}`);
  }
  const publishedRoutes = [...activeRoutes, ...warningRoutes];
  const health = network ? await sourceHealth(publishedRoutes) : {};
  const exclusionById = new Map((audit.catalogue_exclusions || [])
    .filter((item) => item.route_id)
    .map((item) => [item.route_id, item]));

  const legacyRecords = legacyRoutes.map((route) => {
    const checks = staticChecks(route, allLegacyIds);
    const sourceResults = (route.sources || []).map((url) => health[url]).filter(Boolean);
    const sourcesReachable = !network || (sourceResults.length === route.sources.length && sourceResults.every((result) => result.ok));
    const isWarning = audit.publish_with_warnings && withheld.has(route.id);
    const isReady = ready.has(route.id);
    const staticPass = checksPassed(checks);
    const releaseResult = audit.route_results?.[route.id] || null;
    const severity = isWarning ? warningSeverity[route.id] : null;
    const severityMeta = severity ? WARNING_SEVERITIES[severity] : null;
    const releaseStatus = isWarning
      ? 'warning'
      : !isReady || withheld.has(route.id) || !staticPass || !sourcesReachable
        ? 'fail'
        : releaseResult?.status === 'pass'
          ? 'pass'
          : 'reviewing';
    return {
      id: route.id,
      title: route.title,
      origin: route.catalogue_version === VERSION ? 'expansion_2_3_0' : 'legacy',
      release_status: releaseStatus,
      published_tab: releaseStatus === 'pass' ? 'main' : (releaseStatus === 'warning' ? 'issues' : null),
      release_reason: isWarning
        ? issueDisplayReason(releaseResult?.reason || exclusionById.get(route.id)?.reason)
        : '',
      warning_severity: severity,
      warning_severity_label: severityMeta?.label || '',
      warning_severity_explanation: severityMeta?.explanation || '',
      verification_level: route.verification_level,
      checks: { ...(releaseResult?.checks || {}), ...checks, static_checks_passed: staticPass, sources_reachable: sourcesReachable },
      source_urls: route.sources,
      source_results: network ? sourceResults : [],
    };
  });

  const candidateRecords = (data.ROAD_BOOK_V2_CANDIDATES || []).map(candidateRecord);
  const records = [...legacyRecords, ...candidateRecords];
  const passedRecords = legacyRecords.filter((record) => record.release_status === 'pass');
  const warningRecords = legacyRecords.filter((record) => record.release_status === 'warning');
  const warningSeverityCounts = Object.fromEntries(Object.keys(WARNING_SEVERITIES)
    .map((severity) => [severity, warningRecords.filter((record) => record.warning_severity === severity).length]));
  const summary = {
    total_records: records.length,
    legacy_records: legacyRecords.length,
    candidate_records: candidateRecords.length,
    pass_catalogue: activeRoutes.length,
    active_catalogue: activeRoutes.length,
    warning_catalogue: warningRoutes.length,
    published_catalogue: publishedRoutes.length,
    passed: passedRecords.length,
    warning: warningRecords.length,
    warning_severity: warningSeverityCounts,
    research: candidateRecords.length,
    reviewing: legacyRecords.filter((record) => record.release_status === 'reviewing').length,
    withheld: records.filter((record) => record.release_status === 'withheld').length,
    failed: records.filter((record) => record.release_status === 'fail').length,
    published_static_failures: legacyRecords.filter((record) => record.published_tab && record.checks.static_checks_passed !== true).length,
    published_source_failures: network ? legacyRecords.filter((record) => record.published_tab && record.checks.sources_reachable !== true).length : null,
    active_stops: activeRoutes.reduce((sum, route) => sum + route.stops.length, 0),
    unique_active_sources: new Set(activeRoutes.flatMap((route) => route.sources)).size,
    warning_stops: warningRoutes.reduce((sum, route) => sum + route.stops.length, 0),
    published_stops: publishedRoutes.reduce((sum, route) => sum + route.stops.length, 0),
    navigation_excluded_stops: publishedRoutes.reduce((sum, route) => sum + (route.stops || []).filter((stop) => stop.navigation_excluded).length, 0),
    unique_published_sources: new Set(publishedRoutes.flatMap((route) => route.sources)).size,
    access_controlled_sources: network ? Object.values(health).filter((result) => result.access_controlled).length : null,
    generic_redirect_sources: network ? Object.values(health).filter((result) => result.generic_redirect).length : null,
    soft_404_sources: network ? Object.values(health).filter((result) => result.soft_404).length : null,
  };

  return {
    document_title: 'ביקורת שחרור פרטנית למסלולים',
    document_version: VERSION,
    audited_on: audit.audited_on,
    scope: `כל ${legacyRoutes.length} המסלולים המפורסמים (${activeRoutes.length} ב־PASS ו־${warningRoutes.length} עם הערה) וכל ${candidateRecords.length} מועמדי המחקר המוסתרים`,
    network_checked: network,
    summary,
    routes: records,
  };
}

function markdownReport(report) {
  const rows = report.routes.map((route) => {
    const checks = route.checks || {};
    const unpublished = !route.published_tab;
    const map = unpublished
      ? '—'
      : checks.map_geography === true && checks.map_render === true
        ? '✓'
        : route.release_status === 'warning' ? '⚠' : '✗';
    const links = unpublished || !report.network_checked
      ? '—'
      : (checks.sources_reachable === true ? '✓' : '✗');
    const data = checks.required_fields && checks.no_placeholders ? '✓' : '✗';
    const reason = route.release_reason ? ` — ${String(route.release_reason).replaceAll('|', '\\|')}` : '';
    const severity = route.warning_severity_label || '—';
    return `| \`${route.id}\` | ${String(route.title).replaceAll('|', '\\|')} | ${route.release_status}${reason} | ${severity} | ${data} | ${map} | ${links} |`;
  }).join('\n');
  return `# ביקורת שחרור פרטנית למסלולים — גרסה ${VERSION}\n\n` +
    `מועד ביקורת: ${report.audited_on}. היקף: ${report.scope}.\n\n` +
    `## סיכום\n\n` +
    `- ${report.summary.total_records} רשומות נבדקו בנפרד.\n` +
    `- ${report.summary.pass_catalogue} מסלולים ב־PASS מפורסמים בטאב הראשי.\n` +
    `- ${report.summary.warning_catalogue} מסלולים מפורסמים בטאב נפרד עם הערה מדויקת ושיקול דעת.\n` +
    `- חלוקת המסלולים עם ההערות: ${report.summary.warning_severity.minor_navigation} „תיקון ניווט קטן”, ${report.summary.warning_severity.conditional} „מסלול מותנה” ו־${report.summary.warning_severity.major} „בעיה מהותית”.\n` +
    `- בסך הכול מפורסמים ${report.summary.published_catalogue} מסלולים; ${report.summary.research} מועמדי מחקר לא גמורים נשארים מוסתרים.\n` +
    `- ${report.summary.reviewing} מסלולים עדיין בבדיקה ו־${report.summary.failed} מסלולי מקור נכשלו בשער הסטטי.\n` +
    `- ${report.summary.published_static_failures} מסלולים מפורסמים נכשלו בשער מבנה/מפה; ${report.network_checked ? report.summary.published_source_failures : '—'} נכשלו בבדיקת מקורות חיה.\n` +
    `- ${report.network_checked ? report.summary.access_controlled_sources : '—'} מקורות רשמיים נפתחו בדפדפן אך החזירו חסימת WAF לבדיקת HTTP; הסטטוס הגולמי נשמר בדוח.\n` +
    `- ${report.network_checked ? report.summary.generic_redirect_sources : '—'} קישורים הוסטו לדף בית כללי ו־${report.network_checked ? report.summary.soft_404_sources : '—'} החזירו דף 404 רך; שניהם נחשבים כשל.\n` +
    `- ${report.summary.published_stops} תחנות ו־${report.summary.unique_published_sources} מקורות ייחודיים נכללים ב־${report.summary.published_catalogue} המסלולים המפורסמים.\n\n` +
    `- ${report.summary.navigation_excluded_stops} נקודות בעייתיות נשמרות כתיעוד בלבד והוחרגו ממפות הניווט.\n\n` +
    `## תוצאה לכל מסלול\n\n` +
    `| מזהה | מסלול | סטטוס | קטגוריית הערה | נתונים | מפה | מקורות |\n` +
    `|---|---|---|---|---:|---:|---:|\n${rows}\n\n` +
    `## שלוש קטגוריות ההערה\n\n` +
    `- **תיקון ניווט קטן:** ${WARNING_SEVERITIES.minor_navigation.explanation}\n` +
    `- **מסלול מותנה:** ${WARNING_SEVERITIES.conditional.explanation}\n` +
    `- **בעיה מהותית:** ${WARNING_SEVERITIES.major.explanation}\n\n` +
    `## פירוש השער\n\n` +
    `PASS טכני מאשר מבנה, רצף ניווט, טעינת מפה, קישורים ותצוגה. הוא אינו הבטחה שמצב הכביש, מזג האוויר או הנחיות הביטחון לא השתנו לאחר מועד הביקורת.\n\n` +
    `WARNING הוא מסלול מפורסם בטאב נפרד. הבעיה המדויקת מוצגת בהבלטה כדי לאפשר החלטה מודעת; הסטטוס אינו PASS ואינו מסתיר את המסלול. RESEARCH הוא מועמד לא גמור שאינו מפורסם בממשק.\n`;
}

async function main() {
  const write = process.argv.includes('--write');
  const network = process.argv.includes('--network');
  const report = await buildAudit({ network });
  if (write) {
    await mkdir(REPORT_DIR, { recursive: true });
    await writeFile(path.join(REPORT_DIR, 'route-release-audit-2.3.0.json'), `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(path.join(REPORT_DIR, 'ROUTE_RELEASE_AUDIT_2_3_0.md'), markdownReport(report));
  }
  console.log(JSON.stringify(report.summary));
  if (report.summary.failed > 0
      || report.summary.reviewing > 0
      || report.summary.published_static_failures > 0
      || (network && report.summary.published_source_failures > 0)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
