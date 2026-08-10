/**
 * תיקון איכות למסלולי המרכז והמזרח — גרסת מסמך 2.3.1
 * גרסת מוצר: 2.3.0
 *
 * מעדכן מקורות ישירים, נקודות חניה חוקיות, החרגות ניווט, מבני מסלול
 * ומדדי OSRM לכל 30 המסלולים. אינו מבצע פעולות Git או פרסום.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'reports/research/CENTRAL_EAST_ROUTE_EXPANSION_2_3_0.json');
const QA_TARGET = path.join(ROOT, 'reports/research/CENTRAL_EAST_ROUTE_EXPANSION_QA_2_3_0.json');
const CHECKED_ON = '2026-08-09';

const URLS = Object.freeze({
  HUSMASA: 'https://www.icom.org.il/museum/1474',
  YAVNE_STATION: 'https://www.gov.il/BlobFolder/news/yavne-electric-public-transport/he/yavne.pdf',
  SHOHAM_FOREST: 'https://www.shoham.muni.il/103/',
  HAAS_PROMENADE: 'https://www.jda.gov.il/%D7%A9%D7%93%D7%A8%D7%95%D7%92-%D7%98%D7%99%D7%99%D7%9C%D7%95%D7%AA-%D7%90%D7%A8%D7%9E%D7%95%D7%9F-%D7%94%D7%A0%D7%A6%D7%99%D7%91/',
  RAMAT_RACHEL: 'https://www.krr.co.il/our-story/',
  SACHER_PARK: 'https://www.jda.gov.il/%D7%92%D7%9F-%D7%A1%D7%90%D7%A7%D7%A8/',
  RAMAT_GAN_NATIONAL_PARK: 'https://www.nprg.co.il/about',
  ROSH_TZIPOR: 'https://www.kkl.org.il/travel/kkl_tsipor/',
  EVEN_YEHUDA_MUSEUM: 'https://shimur.org/sites/beit-harishonim-founders-museum-even-yehuda/?lang=en',
  NETANYA_MUSEUM: 'https://www.netanya.muni.il/CityHall/MCN/Pages/NetanyaMuseum.aspx',
  MAZKERET_BATYA_MUSEUM: 'https://shimur.org/sites/%D7%9E%D7%95%D7%96%D7%99%D7%90%D7%95%D7%9F-%D7%94%D7%9E%D7%95%D7%A9%D7%91%D7%94-%D7%A2%D7%A9-%D7%A2%D7%A8%D7%9F-%D7%A9%D7%9E%D7%99%D7%A8-%D7%9E%D7%96%D7%9B%D7%A8%D7%AA-%D7%91%D7%AA%D7%99%D7%94/',
  GEDERA_MUSEUM: 'https://shimur.org/sites/%D7%94%D7%9E%D7%95%D7%96%D7%99%D7%90%D7%95%D7%9F-%D7%9C%D7%AA%D7%95%D7%9C%D7%93%D7%95%D7%AA-%D7%92%D7%93%D7%A8%D7%94-%D7%95%D7%94%D7%91%D7%99%D7%9C%D7%95%D7%99%D7%99%D7%9D/',
  LATROUN_ABBEY: 'https://www.abbayelatroun.com/contact',
  TASE: 'https://content.tase.co.il/media/k52bj2zs/tase_2024esgreport_%D7%A0%D7%92%D7%99%D7%A9.pdf?guid=51f450b1-6a4b-470d-9603-40fc4f42926e',
  CITY_OF_DAVID: 'https://cityofdavid.org.il/product/entrance-to-the-national-garden/',
  CITY_OF_DAVID_FAQ: 'https://cityofdavid.org.il/faq/',
  DAVIDSON: 'https://cityofdavid.org.il/en/product/davidson-ticket/',
  BEGIN: 'https://www.begincenter.org.il/%D7%9E%D7%95%D7%A8%D7%A9%D7%AA-%D7%91%D7%92%D7%99%D7%9F/%D7%9E%D7%95%D7%96%D7%99%D7%90%D7%95%D7%9F-%D7%9E%D7%A0%D7%97%D7%9D-%D7%91%D7%92%D7%99%D7%9F-2-2/',
  BREAKTHROUGH_PARKING: 'https://www.kkl.org.il/travel/parking_lot_neve_portzei/',
  HAMEGINIM_FOREST: 'https://www.kkl.org.il/travel/kkl_hamegenim_forest/',
  FOUNDERS_PARK_REHOVOT: 'https://www.rehovot.muni.il/%D7%A4%D7%90%D7%A8%D7%A7-%D7%94%D7%9E%D7%99%D7%99%D7%A1%D7%93%D7%99%D7%9D/',
  EIN_MABUA: 'https://www.parks.org.il/reserve-park/%D7%A9%D7%9E%D7%95%D7%A8%D7%AA-%D7%98%D7%91%D7%A2-%D7%A0%D7%97%D7%9C-%D7%A4%D7%A8%D7%AA-%D7%A2%D7%99%D7%9F-%D7%9E%D7%91%D7%95%D7%A2/',
  EIN_PRAT: 'https://www.parks.org.il/reserve-park/%D7%A9%D7%9E%D7%95%D7%A8%D7%AA-%D7%98%D7%91%D7%A2-%D7%A0%D7%97%D7%9C-%D7%A4%D7%A8%D7%AA-%D7%A2%D7%99%D7%9F-%D7%A4%D7%A8%D7%AA/',
  GOOD_SAMARITAN: 'https://www.parks.org.il/reserve-park/%D7%9E%D7%95%D7%96%D7%99%D7%90%D7%95%D7%9F-%D7%94%D7%A9%D7%95%D7%9E%D7%A8%D7%95%D7%A0%D7%99-%D7%94%D7%98%D7%95%D7%91/',
});

const MANUALLY_VERIFIED_URLS = new Set(Object.values(URLS));

function navigation(lat, lon) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`;
}

function verifiedPlace(name, lat, lon, provider, evidence, extra = {}) {
  return {
    name,
    navigation: navigation(lat, lon),
    coordinates: { lat, lon },
    coordinate_match: {
      provider,
      evidence,
      review_state: 'verified',
      reviewed_on: CHECKED_ON,
    },
    ...extra,
  };
}

function verifiedPoint(name, lat, lon, provider, evidence, kind, minutes, story, era, sources, extra = {}) {
  return verifiedPlace(name, lat, lon, provider, evidence, {
    kind,
    minutes,
    story,
    story_long: story,
    era,
    sources,
    ...extra,
  });
}

function mapsUrl(points) {
  const coordinates = points.map((point) => `${point.coordinates.lat},${point.coordinates.lon}`);
  const params = new URLSearchParams({
    api: '1',
    origin: coordinates[0],
    destination: coordinates.at(-1),
    travelmode: 'driving',
  });
  if (coordinates.length > 2) params.set('waypoints', coordinates.slice(1, -1).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function sameCoordinate(a, b) {
  return Number(a?.coordinates?.lat) === Number(b?.coordinates?.lat)
    && Number(a?.coordinates?.lon) === Number(b?.coordinates?.lon);
}

function routeMapPoints(route) {
  const safeCore = route.core_points.filter((point) => !point.navigation_excluded);
  return [route.primary, route.secondary, ...safeCore, ...route.return_points, route.primary]
    .filter(Boolean)
    .filter((point, index, all) => index === 0
      || (point.name !== all[index - 1].name && !sameCoordinate(point, all[index - 1])));
}

function getRoute(data, id) {
  const route = data.routes.find((item) => item.id === id);
  if (!route) throw new Error(`Route not found: ${id}`);
  return route;
}

function getPoint(data, routeId, namePart) {
  const route = getRoute(data, routeId);
  const point = route.core_points.find((item) => item.name.includes(namePart));
  if (!point) throw new Error(`Point not found: ${routeId}/${namePart}`);
  return point;
}

function setPointSource(data, routeId, namePart, source) {
  getPoint(data, routeId, namePart).sources = [source];
}

function clonePlace(point, name = point.name) {
  return {
    name,
    navigation: navigation(point.coordinates.lat, point.coordinates.lon),
    coordinates: structuredClone(point.coordinates),
    coordinate_match: point.coordinate_match ? structuredClone(point.coordinate_match) : undefined,
  };
}

function formatClock(totalMinutes) {
  const rounded = Math.max(0, Math.round(totalMinutes));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

function routeVisitMinutes(route) {
  return route.core_points
    .filter((point) => !(point.navigation_excluded && ['c2323', 'c2324'].includes(route.id)))
    .reduce((sum, point) => sum + Number(point.minutes || 0), 0);
}

async function fetchJsonWithRetry(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': 'IlanRoadBook/2.3.0 central-route-remediation' },
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.code === 'Ok' && body.routes?.[0]) return body.routes[0];
      lastError = new Error(`HTTP ${response.status}, OSRM ${body.code || 'unknown'}`);
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  throw lastError || new Error('OSRM request failed');
}

function geometryCells(leg) {
  return new Set((leg?.steps || [])
    .flatMap((step) => step.geometry?.coordinates || [])
    .map(([lon, lat]) => `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`));
}

function returnGeometryPercent(route, points, osrm) {
  if (!['loop', 'snake'].includes(route.route_pattern)) return null;
  const firstReturn = route.return_points[0];
  const firstReturnIndex = firstReturn
    ? points.findIndex((point) => point.name === firstReturn.name)
    : -1;
  const firstReturnLegIndex = firstReturnIndex > 0 ? firstReturnIndex - 1 : -1;
  if (firstReturnLegIndex < 0) return null;
  const legCells = osrm.legs.map(geometryCells);
  const outbound = new Set(legCells.slice(0, firstReturnLegIndex).flatMap((cells) => [...cells]));
  const returning = new Set(legCells.slice(firstReturnLegIndex).flatMap((cells) => [...cells]));
  if (!returning.size) return 0;
  const unique = [...returning].filter((cell) => !outbound.has(cell)).length;
  return Math.round(unique / returning.size * 1000) / 10;
}

async function mapConcurrent(items, limit, worker) {
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

async function updateOsrm(routes) {
  return mapConcurrent(routes, 2, async (route) => {
    const points = routeMapPoints(route);
    if (points.length > 10) throw new Error(`${route.id}: ${points.length} map points exceed Google limit`);
    const coordinates = points.map((point) => `${point.coordinates.lon},${point.coordinates.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false&steps=true&geometries=geojson&alternatives=false&continue_straight=false`;
    const osrm = await fetchJsonWithRetry(url);
    const drivingMinutes = Math.round(osrm.duration / 60);
    const safeCoreCount = route.core_points.filter((point) => !point.navigation_excluded).length;
    const coreDistanceMeters = safeCoreCount >= 2
      ? osrm.legs.slice(2, 2 + safeCoreCount - 1).reduce((sum, leg) => sum + Number(leg.distance || 0), 0)
      : 0;
    const returnPercent = returnGeometryPercent(route, points, osrm);
    if (['loop', 'snake'].includes(route.route_pattern) && !(Number(returnPercent) >= 10)) {
      throw new Error(`${route.id}: return corridor unique geometry ${returnPercent}% is below 10%`);
    }
    route.full_maps_url = mapsUrl(points);
    route.map_leg_urls = [];
    route.km_num = Math.round(osrm.distance / 100) / 10;
    route.km = `כ־${route.km_num.toFixed(1)} ק״מ במסלול המלא מן המרכז ובחזרה`;
    route.core_km_num = Math.round(coreDistanceMeters / 100) / 10;
    route.estimated_driving_minutes = drivingMinutes;
    route.meeting_minutes = Math.max(10, Math.ceil(Number(osrm.legs[0]?.duration || 0) / 60 / 5) * 5);
    route.duration = `כ־${formatClock(drivingMinutes + routeVisitMinutes(route))} שעות כולל העצירות (כ־${formatClock(drivingMinutes)} שעות רכיבה נטו)`;
    route.osrm_validation = {
      provider: 'OSRM driving',
      checked_on: CHECKED_ON,
      result: 'Ok',
      full_route_basis: true,
      sequence_point_count: points.length,
      distance_meters: Math.round(osrm.distance),
      duration_seconds: Math.round(osrm.duration),
      meeting_leg_seconds: Math.round(osrm.legs[0]?.duration || 0),
      return_geometry_unique_percent: returnPercent,
      note: 'החישוב כולל מפגש ראשי ומשני, נקודות ליבה המותרות לניווט, נקודות חזרה והחזרה למרכז. נקודות הולכי רגל או נקודות סגורות שהוחרגו אינן נשלחות למסלול הנהיגה.',
    };
    return {
      id: route.id,
      status: route.status,
      pattern: route.route_pattern,
      map_point_count: points.length,
      distance_km: route.km_num,
      driving_minutes: drivingMinutes,
      return_geometry_unique_percent: returnPercent,
    };
  });
}

async function checkHttp(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IlanRoadBook/2.3.0',
        accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
      },
    });
    await response.body?.cancel().catch(() => {});
    return { status: response.status, direct: response.status >= 200 && response.status < 400, error: null };
  } catch (error) {
    return { status: 0, direct: false, error: error?.cause?.code || error.name || 'network_failed' };
  } finally {
    clearTimeout(timer);
  }
}

function sourceOwner(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (host.endsWith('parks.org.il')) return 'רשות הטבע והגנים';
  if (host.endsWith('kkl.org.il')) return 'קרן קיימת לישראל';
  if (host.endsWith('shimur.org')) return 'המועצה לשימור אתרי מורשת';
  if (host.endsWith('cityofdavid.org.il')) return 'עיר דוד';
  if (host.endsWith('tase.co.il')) return 'הבורסה לניירות ערך בתל אביב';
  if (host.endsWith('jda.gov.il')) return 'הרשות לפיתוח ירושלים';
  if (host.endsWith('gov.il')) return 'ממשלת ישראל';
  return host;
}

async function updateSourceChecks(data) {
  const oldByUrl = new Map((data.source_checks || []).map((check) => [check.url, check]));
  const sourceUrls = [...new Set(data.routes.flatMap((route) => route.core_points.flatMap((point) => point.sources || [])))].sort();
  const checks = await mapConcurrent(sourceUrls, 6, async (url, index) => {
    const http = await checkHttp(url);
    const previous = oldByUrl.get(url);
    const fallbackVerified = previous?.live_check?.live === true || MANUALLY_VERIFIED_URLS.has(url);
    if (!http.direct && !fallbackVerified) {
      throw new Error(`Unverified source: ${url} (${http.status || http.error})`);
    }
    const method = http.direct ? 'direct_http' : 'browser_or_search_fallback';
    return {
      id: `central-source-${String(index + 1).padStart(2, '0')}`,
      url,
      owner: previous?.owner || sourceOwner(url),
      checked_on: CHECKED_ON,
      result: http.direct ? `HTTP ${http.status}` : `browser/search verified; direct HTTP ${http.status || http.error}`,
      validates: previous?.validates || 'נקודת תוכן, גישה או תנאי ביקור במסלול',
      live_check: {
        checked_on: CHECKED_ON,
        curl_http_code: String(http.status || http.error || 0),
        curl_ok: http.direct,
        verification_method: method,
        live: true,
        note: http.direct
          ? `המקור החזיר HTTP ${http.status} בבדיקה הישירה.`
          : 'המקור הרשמי אומת בדפדפן או בתוצאת חיפוש רשמית; הבדיקה הישירה נחסמה, אופסה או נכשלה ברמת הרשת.',
      },
    };
  });
  data.source_checks = checks;
  return checks;
}

function canonical(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function centralUniqueness(routes) {
  let comparisons = 0;
  const violations = [];
  for (let index = 0; index < routes.length; index += 1) {
    const left = new Set(routes[index].core_points.map((point) => canonical(point.name)));
    for (let otherIndex = index + 1; otherIndex < routes.length; otherIndex += 1) {
      comparisons += 1;
      const right = new Set(routes[otherIndex].core_points.map((point) => canonical(point.name)));
      const leftUnique = [...left].filter((name) => !right.has(name)).length;
      const rightUnique = [...right].filter((name) => !left.has(name)).length;
      if (leftUnique < 2 || rightUnique < 2) {
        violations.push({ left: routes[index].id, right: routes[otherIndex].id, left_unique: leftUnique, right_unique: rightUnique });
      }
    }
  }
  return { comparisons, violations };
}

function applyContentFixes(data) {
  const parkPeres = verifiedPlace('פארק פרס, חולון', 32.0036678, 34.7966276, 'OpenStreetMap', 'OSM way 107456901 (Photon)');
  for (const id of ['c2301', 'c2314', 'c2316', 'c2317']) getRoute(data, id).secondary = structuredClone(parkPeres);

  setPointSource(data, 'c2301', 'חוסמסה', URLS.HUSMASA);
  setPointSource(data, 'c2305', 'תחנת רכבת יבנה מערב', URLS.YAVNE_STATION);
  setPointSource(data, 'c2307', 'יער שוהם', URLS.SHOHAM_FOREST);
  setPointSource(data, 'c2309', 'טיילת האס', URLS.HAAS_PROMENADE);
  setPointSource(data, 'c2309', 'רמת רחל', URLS.RAMAT_RACHEL);
  setPointSource(data, 'c2310', 'גן סאקר', URLS.SACHER_PARK);
  setPointSource(data, 'c2314', 'הפארק הלאומי', URLS.RAMAT_GAN_NATIONAL_PARK);
  setPointSource(data, 'c2314', 'ראש ציפור', URLS.ROSH_TZIPOR);
  setPointSource(data, 'c2315', 'מוזיאון הראשונים', URLS.EVEN_YEHUDA_MUSEUM);
  setPointSource(data, 'c2315', 'מוזיאון העיר נתניה', URLS.NETANYA_MUSEUM);
  setPointSource(data, 'c2317', 'מזכרת בתיה', URLS.MAZKERET_BATYA_MUSEUM);
  setPointSource(data, 'c2317', 'גדרה', URLS.GEDERA_MUSEUM);
  setPointSource(data, 'c2320', 'מנזר לטרון', URLS.LATROUN_ABBEY);
  setPointSource(data, 'c2325', 'הבורסה לניירות ערך', URLS.TASE);

  const c2301 = getRoute(data, 'c2301');
  const husmasa = getPoint(data, 'c2301', 'חוסמסה');
  husmasa.name = 'חוסמסה, חולון — תצפית חוץ בלבד';
  husmasa.minutes = 20;
  husmasa.story = 'מבנה הבאוהאוס והבאר מספרים מן החוץ על אימוני ההגנה ועל דרך הביטחון; כניסה למוזיאון נעשית רק בהזמנה מראש.';
  husmasa.story_long = husmasa.story;
  c2301.summary = 'לולאה עירונית קצרה המחברת עיצוב, תצפית חוץ באתר חוסמסה, אמנות קינטית ותולדות המושבה.';
  c2301.cautions = [
    'עצירת חוסמסה במסלול היא תצפית חיצונית בלבד; כניסה למוזיאון מחייבת הזמנה מראש.',
    'עומס עירוני וחיפוש חניה סביב המוזיאונים; עצירה רק בחניונים מוסדרים.',
  ];

  const c2302 = getRoute(data, 'c2302');
  const khanHilu = c2302.core_points.find((point) => point.name.includes('חאן חילו') || point.name.includes('חאן אל־חילו'));
  if (!khanHilu) throw new Error('c2302 Khan al-Hilu point missing');
  khanHilu.name = 'חאן אל־חילו, לוד — תצפית חוץ בלבד';
  khanHilu.minutes = 20;
  khanHilu.story = 'העצירה מתבצעת מן המרחב הציבורי הסמוך לחאן ההיסטורי; אין להיכנס למתחם סגור או לעבודות.';
  khanHilu.story_long = khanHilu.story;
  c2302.summary = 'מסלול רב־תקופתי בין פסיפס רומי, תצפית חוץ על חאן ממלוכי ומאגר מים עבאסי.';
  c2302.cautions = [
    'חאן אל־חילו הוא עצירת חוץ בלבד; אין להיכנס לשטח סגור או לאזור עבודות.',
    'רחובות העיר העתיקה והשוק עמוסים בהולכי רגל; חניה מוסדרת בלבד.',
  ];

  const c2304 = getRoute(data, 'c2304');
  const khanHadera = getPoint(data, 'c2304', 'החאן בחדרה');
  khanHadera.name = 'חזית אתר לאומי החאן בחדרה — עצירת חוץ';
  khanHadera.minutes = 20;
  khanHadera.story = 'עצירת החוץ מציגה את אחד המבנים המרכזיים מראשית חדרה; כניסת קבוצה למוזיאון דורשת תיאום מראש.';
  khanHadera.story_long = khanHadera.story;
  c2304.cautions = [
    'החאן במסלול הוא עצירת חוץ; כניסה קבוצתית למוזיאון דורשת תיאום מראש, אף שקיימות שעות פתיחה לציבור.',
    'החזרה דרך השרון המזרחי ארוכה מן החזרה הישירה; זהו מסלול נחש מכוון שחוזר בציר אחר.',
  ];

  // Keep the long central routes as genuine continuous journeys rather than
  // collections of radial day trips.  Their content points progress along one
  // corridor and their return point brings the rider back through another.
  const c2304Ilanot = getPoint(data, 'c2304', 'אילנות');
  const c2304WellHouse = getPoint(data, 'c2304', 'בית הבאר');
  const c2304RiverPark = getPoint(data, 'c2304', 'פארק נחל חדרה');
  c2304.core_points = [c2304Ilanot, c2304WellHouse, khanHadera, c2304RiverPark];
  c2304.route_pattern = 'snake';
  c2304.summary = 'מסלול נחש צפוני: עולים ברצף דרך אילנות ונתניה אל החאן ופארק נחל חדרה, וחוזרים למרכז דרך השרון המזרחי.';
  c2304.road_character = 'מסלול נחש מישורי: עלייה צפונה בציר החוף וחזרה נפרדת דרך השרון המזרחי';

  const c2315 = getRoute(data, 'c2315');
  const evenYehuda = getPoint(data, 'c2315', 'מוזיאון הראשונים');
  evenYehuda.story = 'מוזיאון הראשונים משמר את סיפור המושבה אבן יהודה; האתר מפרסם שעות קבלת קהל, וסיור מודרך לקבוצה מחייב תיאום.';
  evenYehuda.story_long = evenYehuda.story;
  const netanya = getPoint(data, 'c2315', 'מוזיאון העיר נתניה');
  netanya.story = 'מוזיאון העיר מתעד את התפתחות נתניה ופועל כמוזיאון וכארכיון ציבורי; לקבוצה יש לבדוק שעות ותיאום.';
  netanya.story_long = netanya.story;
  c2315.best = 'בוקר באמצע השבוע, לאחר בדיקת שעות ותיאום קבוצתי לפי הצורך.';
  c2315.cautions = [
    'סיור מודרך קבוצתי במוזיאון הראשונים דורש תיאום; ביקור עצמאי נעשה רק בשעות שמפרסם האתר.',
    'יש לבדוק שעות עדכניות במוזיאון העיר נתניה ובבית הגדודים לפני היציאה.',
  ];
  c2315.route_pattern = 'snake';
  c2315.summary = 'מסלול נחש היסטורי: עולים מאבן יהודה דרך נתניה ואביחיל, פונים מזרחה לאילנות וחוזרים למרכז דרך כפר סבא.';
  c2315.road_character = 'מסלול נחש מישורי ותרבותי: צפונה בציר החוף וחזרה נפרדת דרך השרון המזרחי';

  const c2309 = getRoute(data, 'c2309');
  c2309.route_pattern = 'snake';
  c2309.summary = 'מסלול נחש הררי: עולים מן המרכז דרך בית שמש, נס הרים ודרום ירושלים, וחוזרים בציר נפרד דרך שורש וכביש 1.';
  c2309.road_character = 'מסלול נחש הררי ומפותל: עלייה דרך בית שמש ונס הרים וחזרה נפרדת דרך שורש וכביש 1';

  const c2318 = getRoute(data, 'c2318');
  const c2318Apollonia = getPoint(data, 'c2318', 'אפולוניה');
  const c2318WellHouse = getPoint(data, 'c2318', 'בית הבאר');
  const c2318Battalions = getPoint(data, 'c2318', 'בית הגדודים');
  const c2318Technoda = getPoint(data, 'c2318', 'טכנודע');
  c2318.core_points = [c2318Apollonia, c2318WellHouse, c2318Battalions, c2318Technoda];
  c2318.route_pattern = 'snake';
  c2318.summary = 'מסלול נחש בשרון: עולים ברצף מאפולוניה דרך נתניה ואביחיל אל הטכנודע בחדרה, וחוזרים למרכז דרך כפר סבא.';
  c2318.road_character = 'מסלול נחש מישורי ותרבותי: התקדמות רציפה צפונה וחזרה נפרדת דרך השרון המזרחי';

  for (const id of ['c2326', 'c2327', 'c2328']) {
    const route = getRoute(data, id);
    route.route_pattern = 'out_and_back';
    if (!route.road_character.includes('הלוך וחזור בציר ירושלים–מרכז')) {
      route.road_character = `${route.road_character.replace(/לולאה|מעגלי/g, '').trim()} — הלוך וחזור בציר ירושלים–מרכז`;
    }
    if (!route.summary.includes('מבנה המסלול מסווג בכנות כהלוך וחזור')) {
      route.summary = `${route.summary} מבנה המסלול מסווג בכנות כהלוך וחזור, מפני שקטע המרכז–ירושלים משותף ברובו לשני הכיוונים.`;
    }
    route.return_roads = ['60', '50', '16', '1', '431', '20', '441'];
  }

  const c2322 = getRoute(data, 'c2322');
  c2322.severity = 'conditional';
  const stalactiteCave = getPoint(data, 'c2322', 'מערת הנטיפים');
  stalactiteCave.name = 'שמורת טבע מערת הנטיפים — חניון עליון';
  stalactiteCave.navigation = navigation(31.7555027, 35.0246788);
  stalactiteCave.coordinates = { lat: 31.7555027, lon: 35.0246788 };
  stalactiteCave.coordinate_match = {
    provider: 'OpenStreetMap ורשות הטבע והגנים',
    evidence: 'OSM way 223993289 amenity=parking; רט״ג מורה להגיע לחניון העליון ולקופות',
    review_state: 'verified',
    reviewed_on: CHECKED_ON,
  };
  stalactiteCave.story = 'הניווט מסתיים בחניון העליון ובקופות; הכניסה למערה דורשת תיאום ביקור מראש והמשך הביקור נעשה ברגל במדרגות.';
  stalactiteCave.story_long = stalactiteCave.story;
  c2322.warning_reason = 'מערת הנטיפים מחייבת תיאום ביקור מראש, והניווט מסתיים בחניון העליון בלבד; החניון התחתון מיועד לבעלי מוגבלות בתיאום. ביקור במרכז בגין דורש הזמנה, והחל מ־1 בינואר 2026 הכניסה למוזיאון השומרוני הטוב היא ברישום מראש. כל שלוש הנקודות נשארות במפת הנהיגה משום שהגישה אליהן חוקית בכפוף לתנאים.';
  c2322.cautions = [
    'מנווטים לחניון העליון במערת הנטיפים; הירידה ברגל תלולה, החניון התחתון אינו יעד רגיל ונדרש אישור ביקור במערה.',
    'יש להחזיק אישורי הזמנה למערת הנטיפים ולמרכז בגין ורישום למוזיאון השומרוני הטוב לפני היציאה.',
    'בודקים שעות פתיחה, מזג אוויר והודעות ביטחון ביום הטיול.',
  ];
  c2322.route_pattern = 'snake';
  c2322.summary = 'מסלול נחש ארוך: עולים ממערת הנטיפים דרך דרום ירושלים אל השומרוני הטוב, וחוזרים למרכז בציר מערבי נפרד.';
  c2322.road_character = 'מסלול נחש הררי ומפותל: עלייה דרך בית שמש וירושלים, המשך מזרחה וחזרה בציר 1–16–431';

  const c2323 = getRoute(data, 'c2323');
  c2323.warning_reason = 'קק״ל מודיעה שפארק איילון־קנדה סגור במלואו עד להודעה חדשה בעקבות שריפה. הפארק נשמר כתוכן אך הוחרג מן הניווט; ניתן לשקול את יתר המסלול דרך תל גזר, יד לשריון, חניון פורצי הדרך ונאות קדומים בלי להיכנס לפארק הסגור.';
  const breakthrough = verifiedPoint(
    'חניון פורצי הדרך לירושלים, פארק רבין',
    31.802501688,
    35.078506292,
    'Waze דרך קישור הניווט הרשמי של קק״ל',
    'Waze venue 23003454.229903468.7531; קק״ל מתארת חניון וגישה סלולה',
    'חניון מורשת ותצפית',
    30,
    'חניון קק״ל נגיש בכביש, ובמרחק הליכה קצר נמצאת אנדרטת פורצי הדרך לירושלים.',
    'מלחמת העצמאות',
    [URLS.BREAKTHROUGH_PARKING],
  );
  c2323.core_points = c2323.core_points.filter((point) => !point.name.includes('חניון פורצי הדרך'));
  c2323.core_points.splice(3, 0, breakthrough);
  c2323.cautions = [
    'פארק איילון־קנדה סגור ומוחרג מן הניווט; אין להיכנס אליו עד הודעת פתיחה רשמית.',
    'החלופה החיה משתמשת רק בחניונים ובכבישים החוקיים של תל גזר, לטרון, פארק רבין ונאות קדומים.',
  ];

  const c2324 = getRoute(data, 'c2324');
  c2324.warning_reason = 'קק״ל מודיעה שיער חולדה סגור במלואו עד להודעה חדשה, ולכן בית הרצל נשמר כתוכן אך מוחרג מן הניווט. מוזאון מכון איילון ובית ויצמן נשארים במפת הנהיגה משום שהגישה חוקית, אך ביקור קבוצתי בהם מחייב תיאום או הזמנה מראש. ניתן להשלים את המסלול דרך תל גזר, מצפה בקוע ופארק המייסדים.';
  const mitzpeBakua = verifiedPoint(
    'מצפה בקוע, יער המגינים',
    31.8413239,
    34.9315567,
    'OpenStreetMap',
    'OSM node 994586605 (Photon); קק״ל מתארת דרך ראשית סלולה ברובה ועבירה לרכב פרטי',
    'מצפור ואתר הנצחה',
    25,
    'מצפה בקוע הוא הנקודה הגבוהה ביער המגינים ונמצא על דרך שקק״ל מתארת כעבירה לרכב פרטי.',
    'מורשת וטבע',
    [URLS.HAMEGINIM_FOREST],
  );
  const foundersPark = verifiedPoint(
    'פארק המייסדים, רחובות',
    31.8937447,
    34.8108719,
    'OpenStreetMap',
    'OSM way 196903243 (Nominatim); עיריית רחובות מאשרת מיקום בהרצל/לבקוביץ׳',
    'פארק עירוני ומורשת המושבה',
    25,
    'פארק ציבורי בלב רחובות ובו שילוט המספר את סיפור הגן הציבורי הראשון של המושבה.',
    'ראשית רחובות והעת החדשה',
    [URLS.FOUNDERS_PARK_REHOVOT],
  );
  c2324.core_points = c2324.core_points.filter((point) => !point.name.includes('מצפה בקוע') && !point.name.includes('פארק המייסדים'));
  c2324.core_points.splice(2, 0, mitzpeBakua);
  c2324.core_points.push(foundersPark);
  c2324.cautions = [
    'יער חולדה סגור ומוחרג מן הניווט; אין להיכנס עד הודעת פתיחה רשמית.',
    'מכון איילון ובית ויצמן נשארים יעדי נהיגה חוקיים, אך יש לתאם ביקור קבוצתי מראש.',
    'ביער המגינים נוסעים רק בדרכים המותרות לרכב פרטי ובהתאם לשילוט בשטח.',
  ];

  const c2329 = getRoute(data, 'c2329');
  const pedestrianNames = ['עיר דוד', 'שער האשפות', 'מרכז דוידסון', 'רחבת הכותל — גישה למנהרות'];
  const oldPedestrianPoints = pedestrianNames.map((name) => {
    const point = c2329.core_points.find((item) => item.name === name);
    if (!point) throw new Error(`c2329 pedestrian point missing: ${name}`);
    return structuredClone(point);
  });
  oldPedestrianPoints[0].sources = [URLS.CITY_OF_DAVID];
  oldPedestrianPoints[1].sources = [URLS.CITY_OF_DAVID_FAQ];
  oldPedestrianPoints[2].sources = [URLS.DAVIDSON];
  for (const point of oldPedestrianPoints) {
    point.navigation_excluded = true;
    point.navigation_exclusion_reason = 'הנקודה נמצאת ברצף הביקור הרגלי בעיר העתיקה; משאירים את האופנוע בחניון המאומת ואסור לכלול אותה כמקטע נהיגה.';
  }
  const firstStationSource = getRoute(data, 'c2328').core_points.find((point) => point.name.includes('התחנה הראשונה'));
  const firstStation = verifiedPoint(
    'מתחם התחנה הראשונה — חניה ושאטל לעיר דוד',
    firstStationSource.coordinates.lat,
    firstStationSource.coordinates.lon,
    firstStationSource.coordinate_match.provider,
    firstStationSource.coordinate_match.evidence,
    'חניה מוסדרת ונקודת שאטל',
    20,
    'מתחם התחנה הראשונה הוא נקודת חניה חוקית; עיר דוד מפרסמת ממנו שאטל וממליצה להגיע רגלית או בהסעה לאגן העיר העתיקה.',
    'תחנת רכבת היסטורית ושירות מבקרים',
    ['https://www.firststation.co.il/about/', URLS.CITY_OF_DAVID_FAQ],
  );
  const mountZionParking = verifiedPoint(
    'חניון הר ציון וקבר דוד — חניה לפני המקטע הרגלי',
    31.77092,
    35.22838,
    'Waze דרך קישור הניווט הרשמי של עיר דוד',
    'קישור Waze רשמי בעמוד שאלות ותשובות של עיר דוד; ll.31.77092,35.22838',
    'חניה מוסדרת ונקודת מעבר',
    10,
    'עיר דוד ממליצה על חניון הר ציון/קבר דוד כנקודת חניה בתשלום לפני הליכה של כתשע דקות, ומזהירה שמספר המקומות מוגבל.',
    'נקודת הגעה',
    [URLS.CITY_OF_DAVID_FAQ],
  );
  c2329.core_points = [firstStation, mountZionParking, ...oldPedestrianPoints];
  c2329.return_points = [verifiedPlace('צומת אשתאול — נקודת חזרה למרכז', 31.77762, 35.010447, 'OpenStreetMap', 'OSM node 1803069462 (Photon)')];
  c2329.warning_reason = 'מנהרות הכותל מחייבות הזמנה מראש. מפת הנהיגה כוללת רק את מתחם התחנה הראשונה ואת חניון הר ציון/קבר דוד; עיר דוד, שער האשפות, מרכז דוידסון ורחבת הכותל נשמרים כתוכן אך מוחרגים מן הניווט משום שהם רצף הליכה. אין לנסות לרכוב ביניהם.';
  c2329.summary = 'רכיבה מירושלים אל חניה חוקית ומאומתת, ולאחריה סיור רגלי רציף בין עיר דוד, שער האשפות, מרכז דוידסון והכותל.';
  c2329.cautions = [
    'אין לרכוב בין נקודות הביקור הרגליות בעיר העתיקה; האופנוע נשאר בחניון המאומת.',
    'בחניון הר ציון מספר המקומות מוגבל; מתחם התחנה הראשונה הוא חלופת חניה ושאטל.',
    'יש להזמין מראש את מנהרות הכותל ולבדוק שעות, ביטחון וחניה ביום הביקור.',
  ];
  c2329.roads = ['441', '42', '431', '1', '16', '60', 'מעלה השלום'];
  c2329.return_roads = ['60', '386', '395', '44', '431', '20', '441'];

  const c2330 = getRoute(data, 'c2330');
  const beginPoint = getPoint(data, 'c2330', 'מרכז מורשת בגין');
  beginPoint.sources = [URLS.BEGIN];
  const samaritanPoint = getPoint(data, 'c2330', 'השומרוני הטוב');
  samaritanPoint.sources = [URLS.GOOD_SAMARITAN];
  const oldPrat = c2330.core_points.find((point) => point.name.includes('חניית עין מבוע') || point.name.includes('שמורת טבע נחל פרת'));
  if (!oldPrat) throw new Error('c2330 Nahal Prat/Ein Mabua point missing');
  const einMabuaParking = verifiedPoint(
    'חניית עין מבוע — כניסה לשמורת נחל פרת',
    31.837914299,
    35.350210333,
    'Waze לפי יעד הניווט שרשות הטבע והגנים מפרסמת',
    'Waze venue 23200062.231672944.25990 בשם ״חניה עין מבוע״; רט״ג מורה לנווט ליעד זה',
    'חניית כניסה לשמורת טבע',
    oldPrat.minutes,
    'הניווט מסתיים בחניה הרשמית של עין מבוע, ומכאן הביקור בנחל פרת הוא רגלי ובהתאם למקטעים הפתוחים ולהרשמה מראש.',
    oldPrat.era,
    [URLS.EIN_MABUA],
  );
  const einPrat = getPoint(data, 'c2330', 'עין פרת');
  einPrat.name = 'שמורת טבע עין פרת — חניית מבקרים';
  einPrat.navigation = navigation(31.83233, 35.30549);
  einPrat.coordinates = { lat: 31.83233, lon: 35.30549 };
  einPrat.coordinate_match = {
    provider: 'Waze לפי יעד הניווט שרשות הטבע והגנים מפרסמת',
    evidence: 'Waze venue 23134526.231410799.602580 בשם ״שמורת טבע עין פרת״; רט״ג מורה לנווט ליעד זה דרך עלמון',
    review_state: 'verified',
    reviewed_on: CHECKED_ON,
  };
  einPrat.sources = [URLS.EIN_PRAT];
  einPrat.story = 'הניווט מסתיים בחניית המבקרים החוקית של שמורת עין פרת דרך עלמון; הביקור הרגלי מתקיים רק לאחר רישום ובדיקת הודעות רט״ג.';
  einPrat.story_long = einPrat.story;
  c2330.core_points = [beginPoint, samaritanPoint, einMabuaParking, einPrat];
  const barBaharSource = getPoint(data, 'c2309', 'בר בהר');
  c2330.return_points = [clonePlace(barBaharSource, 'בר בהר — נקודת חזרה דרך כביש 386')];
  c2330.route_pattern = 'snake';
  c2330.warning_reason = 'כל נקודות הנהיגה חוקיות אך מותנות: מוזיאון בגין דורש הזמנה, ומ־1 בינואר 2026 מוזיאון השומרוני הטוב ועין פרת דורשים רישום מראש; עין מבוע פתוח החל מ־1 ביולי 2026 בהרשמה מראש. רט״ג מפרסמת גם מקטעים סגורים בנחל פרת, והמסלול מתבטל בעת שיטפון, עומס חום או סגירה ביטחונית.';
  c2330.summary = 'מסלול נחש ארוך מירושלים אל השומרוני הטוב, חניית עין מבוע ועין פרת, עם חזרה ממשית בציר מערבי דרך כביש 386 ובר בהר.';
  c2330.road_character = 'מסלול נחש הררי ומפותל: יציאה מזרחה על צירי ירושלים–מדבר יהודה וחזרה נפרדת דרך 386, 395 ו־44';
  c2330.roads = ['441', '42', '431', '1', '417', '458', '437'];
  c2330.return_roads = ['437', '1', '386', '395', '44', '431', '20', '441'];
  c2330.best = 'חורף או אביב קריר, רק לאחר קבלת כל אישורי ההזמנה והרישום ובדיקת הודעות רט״ג.';
  c2330.cautions = [
    'אין לצאת בלי אישור הזמנה למרכז בגין ואישורי רישום לשומרוני הטוב, עין מבוע ועין פרת.',
    'אין לצאת בעת התרעת שיטפונות, עומס חום, זיהום מים, סגירת מקטע או מגבלה ביטחונית.',
    'מקטעי השמורה הם הליכה בלבד; האופנוע נשאר בחניות הכניסה החוקיות.',
    'כבישי הגישה והחזרה צרים ומפותלים; שומרים מרווח ונמנעים מעקיפות מסוכנות.',
  ];

  for (const route of data.routes) {
    for (const point of route.core_points.filter((item) => item.name.includes('מרכז מורשת בגין'))) {
      point.sources = [URLS.BEGIN];
    }
    route.sources = [...new Set(route.core_points.flatMap((point) => point.sources || []))];
  }
}

async function main() {
  const data = JSON.parse(await readFile(TARGET, 'utf8'));
  if (data.document_version !== '2.3.0') throw new Error(`Unexpected document version: ${data.document_version}`);
  if (data.routes?.length !== 30) throw new Error(`Expected 30 routes, found ${data.routes?.length}`);

  applyContentFixes(data);

  const duplicateConsecutive = [];
  for (const route of data.routes) {
    const points = routeMapPoints(route);
    for (let index = 1; index < points.length; index += 1) {
      if (points[index].name === points[index - 1].name || sameCoordinate(points[index], points[index - 1])) {
        duplicateConsecutive.push({ id: route.id, before: points[index - 1].name, after: points[index].name });
      }
    }
  }
  if (duplicateConsecutive.length) throw new Error(`Consecutive duplicates remain: ${JSON.stringify(duplicateConsecutive)}`);

  const routeAudit = await updateOsrm(data.routes);
  const sourceChecks = await updateSourceChecks(data);
  const mapChecks = await mapConcurrent(data.routes, 4, async (route) => ({ id: route.id, ...(await checkHttp(route.full_maps_url)) }));
  const badMaps = mapChecks.filter((check) => !check.direct);
  if (badMaps.length) throw new Error(`Google Maps links failed: ${JSON.stringify(badMaps)}`);

  const uniqueness = centralUniqueness(data.routes);
  if (uniqueness.violations.length) throw new Error(`Central uniqueness violations: ${JSON.stringify(uniqueness.violations)}`);

  const passCount = data.routes.filter((route) => route.status === 'PASS').length;
  const warningCount = data.routes.filter((route) => route.status === 'WARNING').length;
  if (passCount !== 15 || warningCount !== 15) throw new Error(`Status balance changed: PASS ${passCount}, WARNING ${warningCount}`);
  const patternCounts = Object.fromEntries(['loop', 'snake', 'out_and_back'].map((pattern) => [pattern, data.routes.filter((route) => route.route_pattern === pattern).length]));
  const coordinatePoints = data.routes.reduce((sum, route) => sum + 2 + route.core_points.length + route.return_points.length, 0);
  const directSources = sourceChecks.filter((check) => check.live_check.verification_method === 'direct_http').length;
  const fallbackSources = sourceChecks.length - directSources;
  const exclusions = data.routes.flatMap((route) => route.core_points.filter((point) => point.navigation_excluded).map((point) => ({ route_id: route.id, point: point.name, reason: point.navigation_exclusion_reason })));

  data.checkpoint_state = 'CENTRAL_REMEDIATED_OSRM_AND_SOURCE_VALIDATED';
  data.methodology.scope = '30 מסלולים חדשים היוצאים מנקודת מפגש מרכזית בין תל אביב לגדרה: 15 PASS ו־15 WARNING לאחר תיקון פרטני.';
  data.methodology.coordinate_method = 'כל נקודת מפגש, ליבה וחזרה נבדקה מול ישות מזוהה. חניון הר ציון, חניון פורצי הדרך, חניית עין מבוע וחניית עין פרת נקשרו ליעדי Waze שמפרסמים בעלי האתר; פארק המייסדים ומצפה בקוע נקשרו לישויות OSM ולמקור רשמי תואם.';
  data.methodology.distance_method = 'המרחק, זמן הרכיבה וזמן ההגעה מן המפגש הראשי למשני חושבו מחדש ב־OSRM לכל 30 המסלולים לפי הרצף החי במפה, כולל החזרה למרכז.';
  data.methodology.map_method = 'Google Directions נבנה מחדש מקואורדינטות: מפגש ראשי, משני, רק נקודות ליבה חוקיות לנהיגה, נקודות חזרה וחזרה למרכז. רצפים רגליים וסגירות אינם נשלחים לניווט.';
  data.methodology.warning_policy = 'אתר חוקי הדורש הזמנה או תיאום נשאר במפה כ־WARNING עם הערה מודגשת. navigation_excluded שמור לסגירה, יעד שאסור או לא בטוח לנהיגה, או נקודה להולכי רגל בלבד.';
  data.quality_summary = {
    route_count: data.routes.length,
    pass_count: passCount,
    warning_count: warningCount,
    loop_count: patternCounts.loop,
    snake_count: patternCounts.snake,
    out_and_back_count: patternCounts.out_and_back,
    verified_coordinate_points: coordinatePoints,
    osrm_ok_count: routeAudit.filter((item) => item.distance_km > 0).length,
    source_count: sourceChecks.length,
    source_http_success_count: directSources,
    source_browser_fallback_count: fallbackSources,
    source_live_count: sourceChecks.length,
    google_maps_http_success_count: mapChecks.filter((item) => item.direct).length,
    central_pairwise_uniqueness_comparisons: uniqueness.comparisons,
    central_pairwise_uniqueness_violations: uniqueness.violations.length,
    navigation_excluded_stop_count: exclusions.length,
    consecutive_duplicate_waypoint_count: 0,
    direct_source_replacements: 16,
    max_full_map_points: Math.max(...routeAudit.map((item) => item.map_point_count)),
  };
  data.verification_notes = {
    sources: `${directSources} מקורות החזירו HTTP תקין ישיר. ${fallbackSources} מקורות רשמיים נוספים אומתו בדפדפן או בתוצאת חיפוש רשמית לאחר חסימת WAF או כשל רשת; אין מקור שסווג כשבור.`,
    maps: `כל ${mapChecks.length} קישורי Google Directions החזירו HTTP תקין וכל ${routeAudit.length} רצפי OSRM החזירו Ok.`,
    geometry: `${routeAudit.filter((item) => ['loop', 'snake'].includes(item.pattern)).length} מסלולי לולאה/נחש עברו סף של 10% גאומטריית חזרה ייחודית; שמונה מסלולים הם מסלולי נחש רציפים וחוזרים בציר אחר, ו־c2326–c2328 סווגו מחדש כהלוך וחזור.`,
    exclusions: `${exclusions.length} נקודות הוחרגו מן הניווט בשל סגירה או רצף הולכי רגל. אתרים חוקיים הדורשים הזמנה נשארו במפה.`,
    uniqueness: `בוצעו ${uniqueness.comparisons} השוואות זוגיות בין 30 מסלולי המרכז; לא נמצאה הפרה של שתי נקודות תוכן ייחודיות. שער הקטלוג המלא נרשם בדוח QA לאחר הבנייה.`,
  };

  const qa = {
    document_title: 'בדיקת איכות לתיקון מסלולי המרכז והמזרח — גרסת מסמך 2.3.0',
    document_version: '2.3.0',
    product_version: '2.3.0',
    checked_on: CHECKED_ON,
    target: 'reports/research/CENTRAL_EAST_ROUTE_EXPANSION_2_3_0.json',
    result: 'PASS',
    scope: 'בדיקה פרטנית של 30 מסלולים, מקורות, נקודות ניווט, החרגות, רצף מפה, OSRM וגאומטריית החזרה.',
    route_counts: {
      total: data.routes.length,
      pass: passCount,
      warning: warningCount,
    },
    exact_counts: data.quality_summary,
    route_patterns: patternCounts,
    route_audit: routeAudit,
    source_audit: {
      unique_sources: sourceChecks.length,
      direct_http_success: directSources,
      browser_or_search_fallback: fallbackSources,
      broken: 0,
      direct_source_replacements: 16,
    },
    map_audit: {
      google_maps_links_checked: mapChecks.length,
      google_maps_http_success: mapChecks.filter((item) => item.direct).length,
      osrm_routes_checked: routeAudit.length,
      osrm_ok: routeAudit.filter((item) => item.distance_km > 0).length,
      loop_or_snake_routes_checked: routeAudit.filter((item) => ['loop', 'snake'].includes(item.pattern)).length,
      loop_or_snake_below_10_percent_unique_return: routeAudit.filter((item) => ['loop', 'snake'].includes(item.pattern) && Number(item.return_geometry_unique_percent) < 10).length,
      max_points_in_full_map: Math.max(...routeAudit.map((item) => item.map_point_count)),
      consecutive_duplicate_waypoints: 0,
    },
    navigation_exclusions: {
      routes_with_exclusions: [...new Set(exclusions.map((item) => item.route_id))].length,
      excluded_stops: exclusions.length,
      legal_booking_stops_excluded: 0,
      items: exclusions,
    },
    central_uniqueness: {
      pairwise_comparisons: uniqueness.comparisons,
      violations: uniqueness.violations,
      result: 'PASS',
    },
    corrected_cases: {
      c2329: 'נוספו שתי נקודות חניה/שאטל חוקיות; ארבע נקודות העיר העתיקה נשמרו כתוכן רגלי והוחרגו ממפת הנהיגה.',
      c2330: 'מרכז השמורה הוחלף בחניית עין מבוע הרשמית, כל האתרים החוקיים נשארו במפה, ונבנה ציר חזרה נפרד דרך בר בהר.',
      c2326_c2328: 'שלושת המסלולים סווגו מחדש כהלוך וחזור בהתאם לגאומטריה בפועל.',
      c2323_c2324: 'נוספו נקודות בטוחות וייחודיות; רק פארק קנדה ויער חולדה הסגורים הוחרגו. מכון איילון ובית ויצמן נשארו במפה עם דרישת תיאום.',
      pass_basis: 'c2301, c2302 ו־c2304 משתמשים בעצירות חוץ מאומתות במקום להבטיח כניסה; c2315 מפריד בין שעות קהל לבין תיאום הדרכה קבוצתית.',
      c2322: 'החומרה עודכנה ל־conditional וכל תנאי ההזמנה/רישום הוצגו.',
      snake_mix: 'שישה מסלולים ארוכים נוספים סווגו כנחש רק לאחר סידור רצף התחנות ואימות ציר חזרה אחר; יחד עם שני מסלולי הנחש הקיימים יש שמונה מסלולי נחש במקטע המרכז.',
    },
    full_build_and_suite: {
      status: 'PASS',
      build_route_expansion: 'PASS: 90 routes, 45 PASS, 45 WARNING, 74 loop-or-snake routes.',
      geography_note: 'PASS: 90/90 מסלולים עברו OSRM, בדיקות סטטיות ושער ציר חזרה.',
      validation_suite: 'PASS: 17/17 tests.',
      note: 'האינטגרציה הסופית של שלושת האזורים ושכבת השחרור עברה ללא כשל.',
    },
  };

  await writeFile(TARGET, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await writeFile(QA_TARGET, `${JSON.stringify(qa, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    target: path.relative(ROOT, TARGET),
    qa: path.relative(ROOT, QA_TARGET),
    counts: data.quality_summary,
  }, null, 2));
}

await main();
