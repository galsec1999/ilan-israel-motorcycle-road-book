/**
 * אימות גאוגרפיה ומסלולי כביש — גרסת מסמך 2.3.0
 * גרסת מוצר: 2.3.0
 *
 * הבדיקה עוברת על כל מסלול חדש בנפרד. במצב --network היא שולחת את רצף
 * הקואורדינטות ל־OSRM כדי לוודא שקיים מסלול נהיגה רציף ולקבל מרחק וזמן.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '2.3.0';
const REPORT_DIR = path.join(ROOT, 'reports');
const CENTRAL_BAND = Object.freeze({ minLat: 31.78, maxLat: 32.12, minLon: 34.72, maxLon: 34.83 });

function validCoordinate(point) {
  const lat = Number(point?.lat);
  const lon = Number(point?.lon);
  return Number.isFinite(lat) && lat >= 29.4 && lat <= 33.4 && Number.isFinite(lon) && lon >= 34.2 && lon <= 35.95;
}

function centralCoordinate(point) {
  return validCoordinate(point)
    && point.lat >= CENTRAL_BAND.minLat && point.lat <= CENTRAL_BAND.maxLat
    && point.lon >= CENTRAL_BAND.minLon && point.lon <= CENTRAL_BAND.maxLon;
}

function haversineKm(a, b) {
  const radians = (value) => value * Math.PI / 180;
  const lat1 = radians(Number(a.lat));
  const lat2 = radians(Number(b.lat));
  const deltaLat = radians(Number(b.lat) - Number(a.lat));
  const deltaLon = radians(Number(b.lon) - Number(a.lon));
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function osrmRoute(route) {
  const coordinates = route.full_map_coordinates.map((point) => `${point.lon},${point.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false&steps=true&geometries=geojson&alternatives=false&continue_straight=false`;
  let last = { ok: false, url, status: 0, error: 'network_failed' };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': `IlanRoadBook/${VERSION} route-audit` },
      });
      const body = await response.json().catch(() => ({}));
      const result = body.routes?.[0];
      const routePointNames = route.full_map_points || [];
      const firstReturnName = route.return_points?.[0];
      const firstReturnPointIndex = firstReturnName ? routePointNames.indexOf(firstReturnName) : -1;
      const firstReturnLegIndex = firstReturnPointIndex > 0 ? firstReturnPointIndex - 1 : -1;
      const legCells = (result?.legs || []).map((leg) => new Set((leg.steps || [])
        .flatMap((step) => step.geometry?.coordinates || [])
        .map(([lon, lat]) => `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`)));
      const outboundCells = firstReturnLegIndex >= 0
        ? new Set(legCells.slice(0, firstReturnLegIndex).flatMap((cells) => [...cells]))
        : null;
      const returnCells = firstReturnLegIndex >= 0
        ? new Set(legCells.slice(firstReturnLegIndex).flatMap((cells) => [...cells]))
        : null;
      const uniqueReturnCells = outboundCells && returnCells
        ? [...returnCells].filter((cell) => !outboundCells.has(cell)).length
        : null;
      const returnGeometryUniquePercent = returnCells?.size
        ? Math.round(uniqueReturnCells / returnCells.size * 1000) / 10
        : null;
      last = {
        ok: response.ok && body.code === 'Ok' && Number.isFinite(result?.distance) && Number.isFinite(result?.duration),
        url,
        status: response.status,
        code: body.code || '',
        distance_km: result ? Math.round(result.distance / 100) / 10 : null,
        duration_minutes: result ? Math.round(result.duration / 60) : null,
        return_geometry_unique_percent: returnGeometryUniquePercent,
        return_geometry_unique_cells: uniqueReturnCells,
        return_geometry_total_cells: returnCells?.size ?? null,
        attempts: attempt,
      };
      if (last.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) return last;
    } catch (error) {
      last = { ok: false, url, status: 0, error: error?.cause?.code || error.name || 'network_failed', attempts: attempt };
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  return last;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function loadExpansion() {
  const context = vm.createContext({ window: {} });
  const relative = `data/route-expansion-v${VERSION}.js`;
  vm.runInContext(await readFile(path.join(ROOT, relative), 'utf8'), context, { filename: relative });
  return context.window.ROAD_BOOK_V23_EXPANSION;
}

export async function buildGeographyAudit({ network = false } = {}) {
  const expansion = await loadExpansion();
  const routes = expansion?.routes || [];
  const records = await mapWithConcurrency(routes, network ? 2 : 8, async (route) => {
    const coordinates = route.full_map_coordinates || [];
    const coordinateCountMatches = coordinates.length === (route.full_map_points || []).length;
    const coordinatesValid = coordinateCountMatches && coordinates.every(validCoordinate);
    const pairDistances = coordinatesValid
      ? coordinates.slice(1).map((point, index) => Math.round(haversineKm(coordinates[index], point) * 10) / 10)
      : [];
    const noImpossibleJump = pairDistances.every((distance) => distance <= 330);
    const returnsToCenter = !['loop', 'snake', 'out_and_back'].includes(route.route_pattern)
      || (centralCoordinate(coordinates[0]) && haversineKm(coordinates[0], coordinates.at(-1)) <= 1);
    const excludedStops = (route.stops || []).filter((stop) => stop.navigation_excluded);
    const safeNavigationExclusions = excludedStops.every((stop) =>
      stop.navigation_name === null
      && String(stop.navigation_exclusion_reason || '').trim().length >= 20
      && !(route.map_points || []).includes(stop.name)
      && !(route.full_map_points || []).includes(stop.name));
    const osrm = network && coordinatesValid ? await osrmRoute(route) : null;
    const expectedKm = Number(route.km_num);
    const distanceConsistent = !network || !Number.isFinite(expectedKm) || expectedKm <= 0 || !osrm?.ok
      ? true
      : osrm.distance_km >= expectedKm * 0.65 && osrm.distance_km <= expectedKm * 1.45;
    const staticPassed = coordinatesValid
      && centralCoordinate(coordinates[0])
      && coordinates.length >= 3
      && coordinates.length <= 10
      && noImpossibleJump
      && returnsToCenter
      && safeNavigationExclusions;
    const routeable = !network || osrm?.ok === true;
    const differentReturnCorridor = !network || !['loop', 'snake'].includes(route.route_pattern)
      ? true
      : Number(osrm?.return_geometry_unique_percent) >= 10;
    const isPassRoute = expansion.pass_route_ids.includes(route.id);
    const routeGate = staticPassed && routeable && distanceConsistent && differentReturnCorridor;
    const passGate = !isPassRoute || routeGate;
    return {
      id: route.id,
      title: route.title,
      publication_status: isPassRoute ? 'pass' : 'warning',
      route_pattern: route.route_pattern,
      map_point_count: (route.full_map_points || []).length,
      checks: {
        coordinate_count_matches: coordinateCountMatches,
        coordinates_inside_israel_bounds: coordinatesValid,
        central_origin: centralCoordinate(coordinates[0]),
        google_directions_point_limit: coordinates.length >= 3 && coordinates.length <= 10,
        no_impossible_direct_jump: noImpossibleJump,
        loop_returns_to_center: returnsToCenter,
        safe_navigation_exclusions: safeNavigationExclusions,
        osrm_routeable: network ? osrm?.ok === true : null,
        stated_distance_consistent: network ? distanceConsistent : null,
        different_return_corridor: network && ['loop', 'snake'].includes(route.route_pattern)
          ? differentReturnCorridor
          : null,
      },
      pair_straight_line_km: pairDistances,
      osrm,
      route_gate: routeGate,
      pass_gate: passGate,
    };
  });
  const passRecords = records.filter((record) => record.publication_status === 'pass');
  return {
    document_title: 'אימות גאוגרפיה ומסלולי כביש',
    document_version: VERSION,
    product_version: VERSION,
    checked_on: '2026-08-09',
    network_checked: network,
    summary: {
      routes_checked: records.length,
      catalogue_count_valid: records.length === 90 && passRecords.length === 45,
      pass_routes_checked: passRecords.length,
      warning_routes_checked: records.length - passRecords.length,
      loop_or_snake_routes: records.filter((record) => ['loop', 'snake'].includes(record.route_pattern)).length,
      routes_with_navigation_exclusions: routes.filter((route) => (route.stops || []).some((stop) => stop.navigation_excluded)).length,
      static_passed: records.filter((record) => Object.entries(record.checks)
        .filter(([, value]) => value !== null).every(([, value]) => value === true)).length,
      osrm_routeable: network ? records.filter((record) => record.osrm?.ok).length : null,
      different_return_corridor_passed: network ? records.filter((record) =>
        !['loop', 'snake'].includes(record.route_pattern) || record.checks.different_return_corridor).length : null,
      route_gate_failures: records.filter((record) => !record.route_gate).length,
      pass_gate_failures: passRecords.filter((record) => !record.pass_gate).length,
    },
    routes: records,
  };
}

function markdown(report) {
  const rows = report.routes.map((route) => {
    const returnDifference = ['loop', 'snake'].includes(route.route_pattern)
      ? `${route.osrm?.return_geometry_unique_percent ?? '—'}%`
      : '—';
    return `| \`${route.id}\` | ${route.title.replaceAll('|', '\\|')} | ${route.publication_status} | ${route.route_pattern} | ${route.map_point_count} | ${route.checks.central_origin ? '✓' : '✗'} | ${route.checks.osrm_routeable === null ? '—' : route.checks.osrm_routeable ? '✓' : '✗'} | ${route.osrm?.distance_km ?? '—'} | ${returnDifference} | ${route.route_gate ? '✓' : '✗'} |`;
  }).join('\n');
  return `# אימות גאוגרפיה ומסלולי כביש — גרסת מסמך ${VERSION}\n\n` +
    `גרסת מוצר: ${VERSION}. מועד בדיקה: ${report.checked_on}.\n\n` +
    `- נבדקו ${report.summary.routes_checked} מסלולים חדשים בנפרד.\n` +
    `- ${report.summary.loop_or_snake_routes} מסלולים הם לולאה או ״נחש״.\n` +
    `- ${report.summary.routes_with_navigation_exclusions} מסלולי אזהרה כוללים נקודה תיעודית שהוחרגה ממפת הניווט.\n` +
    `- ${report.summary.route_gate_failures} מתוך כלל המסלולים נכשלו בשער הגאוגרפי המלא.\n` +
    `- ${report.summary.pass_gate_failures} מסלולי PASS נכשלו בשער הגאוגרפי.\n` +
    `- בכל לולאה או מסלול ״נחש״ נדרש לפחות 10% ציר חזרה ייחודי בגאומטריית OSRM, מעבר לציר היציאה.\n` +
    `- בדיקת רשת מול OSRM: ${report.network_checked ? 'בוצעה' : 'לא בוצעה'}.\n\n` +
    `| מזהה | מסלול | פרסום | מבנה | נקודות | מרכז | OSRM | ק״מ OSRM | חזרה ייחודית | שער |\n` +
    `|---|---|---|---|---:|---:|---:|---:|---:|---:|\n${rows}\n`;
}

async function main() {
  const network = process.argv.includes('--network');
  const write = process.argv.includes('--write');
  const report = await buildGeographyAudit({ network });
  if (write) {
    await mkdir(REPORT_DIR, { recursive: true });
    await writeFile(path.join(REPORT_DIR, 'route-geography-audit-2.3.0.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await writeFile(path.join(REPORT_DIR, 'ROUTE_GEOGRAPHY_AUDIT_2_3_0.md'), markdown(report), 'utf8');
  }
  console.log(JSON.stringify(report.summary));
  if (!report.summary.catalogue_count_valid || report.summary.route_gate_failures > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
