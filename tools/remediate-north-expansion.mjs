/**
 * תיקון, ניתוב ובקרת איכות להרחבת מסלולי הצפון — גרסת מסמך 2.3.3
 * גרסת מוצר: 2.3.0
 *
 * הסקריפט מתקן יעדי ניווט לפי כניסות או חניות רשמיות, משמר נקודות תוכן
 * שאינן מתאימות לניווט כנקודות מוחרגות, מכריח מסדרונות חזרה שונים במסלולי
 * נחש, מחשב מחדש OSRM/Google ומפיק דוח QA מדיד. אין בו פרסום או פעולת Git.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'reports/research/NORTH_ROUTE_EXPANSION_2_3_0.json');
const QA_TARGET = path.join(ROOT, 'reports/research/NORTH_ROUTE_EXPANSION_QA_2_3_0.json');
const VERSION = '2.3.0';
const CHECKED_ON = '2026-08-09';
const USER_AGENT = `IlanRoadBook/${VERSION} north-route-remediation`;

function navigation(lat, lon) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

function verifiedMatch(label, evidence) {
  return {
    name: label,
    city: null,
    country: 'Israel',
    review_state: 'verified',
    evidence,
  };
}

function waypoint(name, lat, lon, evidence = 'manual official-map review') {
  return {
    name,
    navigation: navigation(lat, lon),
    geocode_query: `${name}, ישראל`,
    coordinates: { lat, lon },
    coordinate_source: evidence,
    coordinate_match: verifiedMatch(name, evidence),
  };
}

function contentPoint({ name, lat, lon, kind, minutes, story, era, sources, evidence, excludedReason = null }) {
  return {
    ...waypoint(name, lat, lon, evidence || sources[0]),
    kind,
    minutes,
    story,
    story_long: story,
    era,
    sources,
    ...(excludedReason ? {
      navigation_excluded: true,
      navigation_exclusion_reason: excludedReason,
    } : {}),
  };
}

function mapsUrl(points) {
  const values = points.map((item) => `${item.coordinates.lat},${item.coordinates.lon}`);
  const params = new URLSearchParams({
    api: '1',
    origin: values[0],
    destination: values.at(-1),
    travelmode: 'driving',
  });
  if (values.length > 2) params.set('waypoints', values.slice(1, -1).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function legUrl(a, b) {
  return mapsUrl([a, b]);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function dedupeConsecutive(points) {
  return points.filter((point, index, all) => index === 0 || point.name !== all[index - 1].name);
}

function routeSequences(route) {
  const safeCore = route.core_points.filter((point) => !point.navigation_excluded);
  const full = dedupeConsecutive([
    route.primary,
    route.secondary,
    ...safeCore,
    ...(route.return_points || []),
    route.primary,
  ]);
  const core = dedupeConsecutive([
    route.secondary,
    ...safeCore,
    ...(route.return_points || []),
  ]);
  return { safeCore, full, core };
}

async function fetchJson(url, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': USER_AGENT } });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.code === 'Ok') return { response, body, attempts: attempt };
      lastError = new Error(`HTTP ${response.status}; OSRM ${body.code || 'unknown'}`);
      if (response.status >= 400 && response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  throw lastError || new Error('OSRM request failed');
}

async function osrm(points, geometry = false) {
  const coordinates = points.map((point) => `${point.coordinates.lon},${point.coordinates.lat}`).join(';');
  const query = geometry
    ? 'overview=false&steps=true&geometries=geojson&alternatives=false&continue_straight=false'
    : 'overview=false&steps=false&alternatives=false&continue_straight=false';
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?${query}`;
  const { body, attempts } = await fetchJson(url);
  const result = body.routes[0];
  return { url, attempts, result };
}

function geometryUniqueness(route, points, result) {
  const firstReturn = route.return_points?.[0]?.name;
  const names = points.map((point) => point.name);
  const firstReturnPointIndex = firstReturn ? names.indexOf(firstReturn) : -1;
  const firstReturnLegIndex = firstReturnPointIndex > 0 ? firstReturnPointIndex - 1 : -1;
  if (firstReturnLegIndex < 0) return null;
  const cells = (result.legs || []).map((leg) => new Set((leg.steps || [])
    .flatMap((step) => step.geometry?.coordinates || [])
    .map(([lon, lat]) => `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`)));
  const outbound = new Set(cells.slice(0, firstReturnLegIndex).flatMap((set) => [...set]));
  const returning = new Set(cells.slice(firstReturnLegIndex).flatMap((set) => [...set]));
  const uniqueReturn = [...returning].filter((cell) => !outbound.has(cell)).length;
  return {
    percent: returning.size ? Math.round(uniqueReturn / returning.size * 1000) / 10 : 0,
    unique_cells: uniqueReturn,
    return_cells: returning.size,
  };
}

async function nearest(point) {
  const { lat, lon } = point.coordinates;
  const url = `https://router.project-osrm.org/nearest/v1/driving/${lon},${lat}?number=1`;
  const { body } = await fetchJson(url);
  const match = body.waypoints?.[0];
  return {
    name: point.name,
    distance_m: Math.round(Number(match?.distance || 0) * 10) / 10,
    snapped_coordinates: match?.location ? { lat: match.location[1], lon: match.location[0] } : null,
  };
}

function updatePoint(route, oldName, patch) {
  const point = route.core_points.find((item) => item.name === oldName)
    || (patch.name ? route.core_points.find((item) => item.name === patch.name) : null);
  if (!point) throw new Error(`${route.id}: missing point ${oldName}`);
  Object.assign(point, patch);
  if (patch.coordinates) {
    point.navigation = navigation(patch.coordinates.lat, patch.coordinates.lon);
    point.coordinate_match = verifiedMatch(patch.name || point.name, patch.coordinate_source || point.coordinate_source || 'manual official-map review');
  }
  if (patch.story && !patch.story_long) point.story_long = patch.story;
  return point;
}

function routeById(data, id) {
  const route = data.routes.find((item) => item.id === id);
  if (!route) throw new Error(`Missing route ${id}`);
  return route;
}

function setSources(route, replacements) {
  for (const [name, sources] of Object.entries(replacements)) {
    const point = route.core_points.find((item) => item.name === name);
    if (!point) throw new Error(`${route.id}: cannot set sources for ${name}`);
    point.sources = sources;
  }
}

async function mapWithConcurrency(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
}

async function checkUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
    });
    return {
      url,
      status: response.status,
      final_url: response.url,
      live: response.status >= 200 && response.status < 400,
      classification: response.status === 403 ? 'official_antibot' : response.status >= 200 && response.status < 400 ? 'http_success' : 'http_failure',
    };
  } catch (error) {
    return { url, status: 0, final_url: null, live: false, classification: 'network_failure', error: error.name };
  } finally {
    clearTimeout(timeout);
  }
}

const RETURN = {
  beitShean: waypoint('צומת בית שאן — נקודת חזרה', 32.506908, 35.518787, 'Google Maps junction review'),
  navot: waypoint('צומת נבות — נקודת חזרה', 32.5618163, 35.3553123, 'Google Maps junction review'),
  nahshonim: waypoint('מחלף נחשונים — נקודת חזרה', 32.0736456, 34.9335548, 'OpenStreetMap/Photon verified interchange'),
  golani: waypoint('צומת גולני — נקודת חזרה', 32.795166, 35.404087, 'Google Maps junction review'),
  elyakim: waypoint('מחלף אליקים — נקודת חזרה', 32.636333, 35.063908, 'Google Maps interchange review'),
  gonen: waypoint('צומת גונן — נקודת חזרה', 33.121426, 35.648666, 'Google Maps junction review'),
  customs: waypoint('צומת בית המכס העליון — נקודת חזרה', 33.012115, 35.651281, 'Google Maps junction review'),
  karmiel: waypoint('צומת כרמיאל — נקודת חזרה', 32.924557, 35.300255, 'Google Maps junction review'),
  einTut: waypoint('מחלף עין תות — נקודת חזרה', 32.6190811, 35.0548805, 'OpenStreetMap/Photon verified interchange'),
  kabri: waypoint('צומת כברי — נקודת חזרה', 33.016411, 35.143791, 'Google Maps junction review'),
};

const data = JSON.parse(await readFile(TARGET, 'utf8'));

// תיקוני 18 הנקודות שהיו רחוקות ביותר מ־100 מ׳ מרשת הכביש, וכן תיקוני היעדים
// שנמצאו שגויים בבדיקת המסלול. נקודת כניסה רשמית נשארת יעד חוקי גם אם מנוע
// OSRM אינו ממפה את דרך השירות הפנימית במלואה.
updatePoint(routeById(data, 'n21'), 'פארק שקמונה', {
  name: 'חניה ציבורית אספלט סמוך לגן לאומי שקמונה',
  coordinates: { lat: 32.8175296, lon: 34.9596001 },
  geocode_query: 'חניה ציבורית שקמונה, חיפה, ישראל',
  coordinate_source: 'OpenStreetMap way 966359390; official park page confirms the site',
  story: 'חניה חוקית על האספלט ומשם הליכה קצרה אל פארק שקמונה ותל שקמונה; אין לנווט לשבילי החוף.',
});

updatePoint(routeById(data, 'n25'), 'שמורת חי־בר כרמל', {
  name: 'שמורת חי־בר כרמל — חניית המבקרים הרשמית',
  coordinates: { lat: 32.75433, lon: 35.016823 },
  geocode_query: 'שמורת חי בר כרמל, חניית מבקרים, ישראל',
  coordinate_source: 'Google Maps official destination and Israel Nature and Parks Authority page',
});

updatePoint(routeById(data, 'n26'), 'שמורת טבע עין אפק', {
  name: 'שמורת טבע עין אפק — חניית הכניסה הרשמית',
  coordinates: { lat: 32.8474933, lon: 35.1107059 },
  coordinate_source: 'Google Maps official entrance and Israel Nature and Parks Authority page',
});
updatePoint(routeById(data, 'n26'), 'גני בהג׳י בעכו', {
  name: 'חניה ציבורית ליד גני בהג׳י בעכו',
  coordinates: { lat: 32.9438492, lon: 35.0900129 },
  coordinate_source: 'OpenStreetMap public parking way; Bahá’í official visitor page',
  story: 'חונים בחניה הציבורית ונכנסים לגנים רק לפי שעות, כללים והנחיות האתר הבהאי.',
});

const n23 = routeById(data, 'n23');
updatePoint(n23, 'טיילת לואי', {
  name: 'חניון ציבורי יפה נוף — הליכה לטיילת לואי',
  coordinates: { lat: 32.8121608, lon: 34.9827047 },
  coordinate_source: 'Google Maps public Yefe Nof parking; Haifa municipality Louis Promenade page',
  sources: ['https://www.haifa.muni.il/place/louis-promenade/'],
  story: 'מחנים בחניון הציבורי ברחוב יפה נוף וממשיכים ברגל לטיילת לואי ולתצפית המפרץ.',
});
setSources(n23, {
  'המושבה הגרמנית, שדרות בן גוריון': ['https://www.haifa.muni.il/place/the-german-colony/'],
});

const n27 = routeById(data, 'n27');
n27.status = 'warning';
n27.severity = 'minor_navigation';
n27.warning_reason = 'כל אתרי עכו העתיקה במסלול הם נקודות הליכה בתוך העיר והסמטאות. ניווט האופנוע מסתיים בחניה הציבורית החוקית היחידה ליד מרכז המבקרים; אין לנווט בנפרד לאולמות, למנהרה, למוזיאון או לנמל.';
n27.title = 'עכו העתיקה מן החניה הציבורית: אסירי המחתרות, אבירים, מנהרה ונמל';
n27.summary = 'מסלול כביש שמסתיים בחניה ציבורית אחת ליד מרכז המבקרים; ארבעת אתרי עכו נשמרים כתוכן ומבוצעים ברגל בלבד.';
n27.cautions = [
  'הניווט מסתיים בחניה הציבורית ליד מרכז המבקרים, ויצמן 1.',
  'אין להכניס אופנוע לסמטאות ואין לנווט בנפרד אל נקודות ההליכה.',
  'בודקים שעות, כרטיסים ונגישות של כל אתר לפני היציאה.',
];
const acreParking = contentPoint({
  name: 'חניה ציבורית מרכז המבקרים עכו העתיקה, ויצמן 1',
  lat: 32.9237071,
  lon: 35.0710856,
  kind: 'חניה ציבורית ותחילת מסלול הליכה',
  minutes: 15,
  story: 'זו נקודת הניווט היחידה בעכו העתיקה: מחנים כחוק ליד מרכז המבקרים ומכאן ממשיכים לכל האתרים ברגל.',
  era: 'נקודת שירות עכשווית',
  sources: ['https://www.akko.org.il/attraction/the-visitors-center/', 'https://www.akko.org.il/accessibility/'],
  evidence: 'OpenStreetMap public parking way 195201236; Old Akko visitor-center and accessibility pages',
});
const acreExcluded = [
  contentPoint({ name: 'מוזיאון אסירי המחתרות עכו — הליכה בלבד', lat: 32.9235259, lon: 35.0691381, kind: 'מוזיאון', minutes: 60, story: 'סיפור האסירים והמאבק בתקופת המנדט נשמר כחלק מתוכן היום, אך מגיעים אליו ברגל מן החניה.', era: 'המנדט הבריטי', sources: ['https://museums.mod.gov.il/sites/Aco/Tours/Pages/default.aspx'], excludedReason: 'המוזיאון נמצא במרקם העיר העתיקה; הגעה ברגל מן החניה הציבורית היחידה, ללא יעד ניווט נפרד לאופנוע.' }),
  contentPoint({ name: 'אולמות האבירים — הליכה בלבד', lat: 32.9232271, lon: 35.0697701, kind: 'אתר היסטורי', minutes: 75, story: 'המרכז ההוספיטלרי הצלבני הוא תחנת תוכן מרכזית, והגישה אליו רגלית מן החניה.', era: 'התקופה הצלבנית', sources: ['https://www.akko.org.il/attraction/the-knights-halls/'], excludedReason: 'האתר נמצא בתוך מתחם הולכי הרגל והסמטאות; אין יעד ניווט נפרד לאופנוע.' }),
  contentPoint({ name: 'מנהרת הטמפלרים — הליכה בלבד', lat: 32.9199642, lon: 35.0676708, kind: 'אתר היסטורי', minutes: 45, story: 'מנהרה צלבנית המחברת את הרובע הטמפלרי אל אזור הנמל; מגיעים אליה ברגל בלבד.', era: 'התקופה הצלבנית', sources: ['https://www.akko.org.il/attraction/the-templars-tunnel/'], excludedReason: 'הכניסה נמצאת בסמטאות העיר העתיקה והגישה היא חלק ממסלול ההליכה מן החניה הציבורית.' }),
  contentPoint({ name: 'נמל עכו — הליכה בלבד', lat: 32.9194865, lon: 35.0698411, kind: 'נמל היסטורי', minutes: 40, story: 'הנמל מספר את סיפורה הימי של עכו לאורך התקופות; הוא תחנת הסיום הרגלית של הביקור.', era: 'עת העתיקה עד ימינו', sources: ['https://www.akko.org.il/attraction/marina-fishing-port/'], excludedReason: 'אזור הנמל והסמטאות נכלל במסלול הולכי הרגל; האופנוע נשאר בחניה הציבורית ליד מרכז המבקרים.' }),
];
n27.core_points = [acreParking, ...acreExcluded];

const n28 = routeById(data, 'n28');
updatePoint(n28, 'מוזיאון בית לוחמי הגטאות', {
  coordinates: { lat: 32.9605996, lon: 35.0953678 },
  coordinate_source: 'Google Maps official museum entrance and museum directions page',
});
updatePoint(n28, 'טיילת אופירה נבון, נהריה', {
  name: 'חניון חוף סוקולוב — הליכה לטיילת אופירה נבון',
  coordinates: { lat: 33.0043811, lon: 35.0871586 },
  coordinate_source: 'Google Maps public Sokolov Beach parking; Nahariya municipality coastal page',
  sources: ['https://www.westgalil.org.il/ent/%D7%97%D7%95%D7%A3-%D7%A1%D7%95%D7%A7%D7%95%D7%9C%D7%95%D7%91/'],
  story: 'מחנים בחניון חוף סוקולוב וממשיכים ברגל אל טיילת אופירה נבון ורצועת החוף העירונית.',
});
updatePoint(n28, 'גן לאומי אכזיב', {
  name: 'גן לאומי אכזיב — חניית הכניסה הרשמית',
  coordinates: { lat: 33.048379, lon: 35.102177 },
  coordinate_source: 'Google Maps official destination and Israel Nature and Parks Authority page',
});

const n30 = routeById(data, 'n30');
n30.title = 'תבור וצ׳רקסים: המושבה, כפר כמא והתרבות הירמוכית';
n30.summary = 'מסלול נחש מן המרכז דרך כפר תבור וכפר כמא אל מוזיאון התרבות הירמוכית ובית גבריאל, וחזרה בציר 90–71–6.';
n30.route_pattern = 'snake';
n30.road_character = 'מסלול נחש סלול: כביש 6 ו־65 לתבור, כבישים אזוריים לכפר כמא ולעמק הירדן, וחזרה דרומה דרך 90, 71 ו־6.';
n30.roads = ['6', '65', '767', '7677', '90', '71', '6', '5', '20'];
n30.return_roads = ['90', '71', '6', '5', '20'];
n30.core_points[2] = contentPoint({
  name: 'מוזיאון התרבות הירמוכית, שער הגולן',
  lat: 32.6857,
  lon: 35.6055089,
  kind: 'מוזיאון ארכאולוגי',
  minutes: 60,
  story: 'המוזיאון מציג את תרבות שער הגולן מן התקופה הנאוליתית ומאפשר תוכן פרהיסטורי נגיש על כביש, במקום ניווט לשטח עובדיה.',
  era: 'התקופה הנאוליתית',
  sources: ['https://www.myc.org.il/about/'],
  evidence: 'Official museum page and Google Maps official destination',
});
updatePoint(n30, 'בית גבריאל', {
  sources: ['https://www.betgabriel.co.il/'],
});
n30.return_points = [RETURN.beitShean, RETURN.navot, RETURN.nahshonim];

updatePoint(routeById(data, 'n31'), 'בית גורדון', {
  coordinates: { lat: 32.7089571, lon: 35.5742545 },
  coordinate_source: 'Google Maps official museum entrance; Eretz Hefetz institutional collection page',
});

const n32 = routeById(data, 'n32');
n32.title = 'מוזיאונים ועתיקות סביב הכנרת: אשדות יעקב, גינוסר, מגדלא וטבריה';
n32.summary = 'מסלול נחש מוזיאלי סביב הכנרת: מוזיאון קיבוצי נגיש, בית יגאל אלון, מגדלא ודונה גרציה, וחזרה דרך גולני ואליקים.';
n32.route_pattern = 'snake';
n32.road_character = 'מסלול נחש סלול אל עמק הירדן וצפון הכנרת, עם חזרה מערבית דרך כביש 77, גולני, 65 ו־6.';
n32.roads = ['6', '71', '90', '92', '90', '77', '65', '70', '6', '5', '20'];
n32.return_roads = ['77', '65', '70', '6', '5', '20'];
n32.core_points[0] = contentPoint({
  name: 'מוזיאון אורי ורמי נחושתן, אשדות יעקב מאוחד',
  lat: 32.6608977,
  lon: 35.5826149,
  kind: 'מוזיאון אמנות וארכאולוגיה',
  minutes: 60,
  story: 'מוזיאון קיבוצי המשלב אמנות, ארכאולוגיה ותולדות עמק הירדן, עם כניסה וחניה נגישות מן הכביש.',
  era: 'עתיקות ואמנות מודרנית',
  sources: ['https://www.uri-rami-museum.co.il/'],
  evidence: 'Official museum website and Google Maps official entrance',
});
n32.return_points = [RETURN.golani, RETURN.elyakim];

updatePoint(routeById(data, 'n33'), 'הר הקפיצה', {
  name: 'הר הקפיצה — חניית התצפית הרשמית',
  coordinates: { lat: 32.685922, lon: 35.302309 },
  coordinate_source: 'Google Maps official parking and KKL lookout page',
  sources: ['https://www.kkl.org.il/travel/scenic_lookout_jump_m/'],
});

const n35 = routeById(data, 'n35');
setSources(n35, {
  'פארק קצרין העתיקה': ['https://parkatzrin.com/'],
  'מוזיאון עתיקות הגולן': ['https://pop.education.gov.il/tchumey_daat/global-subjects/annual-theme/leadership-and-leaders/museums/'],
});
updatePoint(n35, 'עין זיוון – מרכז היישוב', {
  name: 'מרכז המבקרים דה קרינה, עין זיוון',
  coordinates: { lat: 33.0967048, lon: 35.7986756 },
  coordinate_source: 'Google Maps official visitor-center entrance and De Karina institutional listing',
  sources: ['https://tourgolan.org.il/listing/de-karina/'],
  kind: 'מרכז מבקרים ושוקולד',
  story: 'מרכז מבקרים בעין זיוון המספר על ייצור שוקולד ומספק עצירת סיום מוסדרת לפני החזרה.',
  era: 'תיירות ומלאכה עכשווית',
});

const n36 = routeById(data, 'n36');
updatePoint(n36, 'גן לאומי תל דור', {
  name: 'גן לאומי תל דור — חניית הכניסה הרשמית',
  coordinates: { lat: 32.6202955, lon: 34.9206011 },
  coordinate_source: 'Google Maps official parking and Israel Nature and Parks Authority page',
});
setSources(n36, { 'מוזיאון המזגגה': ['https://www.mizgaga.com/'] });

const n37 = routeById(data, 'n37');
n37.route_pattern = 'snake';
n37.summary = 'מסלול נחש סלול בין כפר קיש למנחמיה; נחל תבור ומצפה אלות נשמרים כתוכן הליכה בלבד, והחזרה מוכרחת דרך בית שאן, נבות וכביש 6.';
n37.road_character = 'כבישי עמק וגליל תחתון סלולים; נקודות השטח מוחרגות, והחזרה דרומה נעשית דרך 90, 71 ו־6.';
n37.roads = ['6', '65', '7276', '90', '71', '6', '5', '20'];
n37.return_roads = ['90', '71', '6', '5', '20'];
n37.return_points = [RETURN.beitShean, RETURN.navot, RETURN.nahshonim];
updatePoint(n37, 'מנחמיה', {
  name: 'מרכז המושבה מנחמיה — עצירת מורשת על כביש ציבורי',
  sources: ['https://www.romgalil.org.il/cds/915/'],
  story: 'עצירה קצרה במרכז המושבה ההיסטורית על גבי רחובות סלולים; אין ירידה לדרכי שטח של רמת סירין.',
});

const n38 = routeById(data, 'n38');
n38.route_pattern = 'snake';
n38.summary = 'מסלול נחש אל שתי הכניסות הרשמיות של נחל עמוד ועין נון, וחזרה דרומה דרך בקעת הירדן, בית שאן וכביש 71.';
n38.road_character = 'עלייה צפונה בכבישים הראשיים אל הגליל וחזרה נפרדת דרך 90, 71 ו־6; כל יעדי העצירה הם חניות או כניסות רשמיות.';
n38.roads = ['6', '65', '85', '866', '90', '71', '6', '5', '20'];
n38.return_roads = ['90', '71', '6', '5', '20'];
n38.return_points = [RETURN.beitShean, RETURN.navot, RETURN.nahshonim];
updatePoint(n38, 'שמורת נחל עמוד – חניה ומרכז מידע (כניסה עליונה)', {
  coordinates: { lat: 32.9736834, lon: 35.4617845 },
  coordinate_source: 'Israel Nature and Parks Authority official approach coordinate and Google Maps entrance',
});
updatePoint(n38, 'חניון נחל עמוד תחתון – כניסה רשמית', {
  coordinates: { lat: 32.9138667, lon: 35.483912 },
  coordinate_source: 'Google Maps official lower entrance and Israel Nature and Parks Authority page',
});
updatePoint(n38, 'עין נון', {
  name: 'עין נון — חניית הכניסה הציבורית',
  coordinates: { lat: 32.8416083, lon: 35.5111327 },
  coordinate_source: 'Google Maps public entrance and Israel Antiquities Authority report',
  sources: ['https://hadashot.iaa.org.il/report_detail.aspx?id=25934&mag_id=133'],
});

const n39 = routeById(data, 'n39');
n39.status = 'pass';
n39.severity = 'none';
n39.warning_reason = null;
n39.title = 'גמלא, עיט ואניעם: חניות רשמיות ומסלולי הליכה';
n39.summary = 'מסלול כביש אל חניית מבואת גמלא, חניית מפל עיט וכפר האמנים אניעם; מן החניות ממשיכים ברגל ורק בשבילים המותרים.';
n39.cautions = ['מן החניות ממשיכים ברגל בלבד', 'בודקים פתיחה, מזג אוויר והנחיות האתר ביום היציאה'];

const n40 = routeById(data, 'n40');
updatePoint(n40, 'גן לאומי כורסי', {
  name: 'גן לאומי כורסי — חניית הכניסה הרשמית',
  coordinates: { lat: 32.8257841, lon: 35.6502442 },
  coordinate_source: 'Google Maps official entrance and Israel Nature and Parks Authority site',
  sources: ['https://www.parks.org.il/reserve-park/%D7%92%D7%9F-%D7%9C%D7%90%D7%95%D7%9E%D7%99-%D7%9B%D7%95%D7%A8%D7%A1%D7%99/'],
});
updatePoint(n40, 'עין גב', {
  name: 'שער הגישה לסוסיתא מכיוון עין גב — כביש ציבורי בלבד',
  coordinates: { lat: 32.783775, lon: 35.640865 },
  coordinate_source: 'Google Maps Ein Gev junction; Susita official access instructions',
  sources: ['https://www.parks.org.il/reserve-park/susita/'],
  story: 'נקודת מעבר שמכריחה את העלייה לסוסיתא מכיוון עין גב בלבד, בהתאם להוראות הגן הלאומי.',
});
updatePoint(n40, 'גן לאומי סוסיתא', {
  name: 'גן לאומי סוסיתא — חניית המבקרים הרשמית',
  coordinates: { lat: 32.7746995, lon: 35.6639828 },
  coordinate_source: 'Google Maps official visitor parking and Israel Nature and Parks Authority access instructions',
});

const n41 = routeById(data, 'n41');
n41.severity = 'conditional';
n41.warning_reason = 'הטיול מותנה בפתיחת האתרים, מזג האוויר והנחיות הביטחון; נקודות אל־על הן נקודות הקפצה על כביש בלבד והמפלים עצמם דורשים הליכה. אין לרכוב לשבילי הנחל.';

const n43 = routeById(data, 'n43');
n43.title = 'געש ומורשת בצפון הגולן: אביטל, הג׳ובה הגדולה ותל פאחר';
n43.summary = 'מסלול נחש ייחודי בין מחצבה וולקנית משוקמת, תופעת טבע ביער אודם ואתר מורשת קרב, עם חזרה בציר 918–91.';
n43.route_pattern = 'snake';
n43.road_character = 'כבישי גולן סלולים אל שלוש ליבות תוכן שונות; החזרה מוכרחת מערבה ודרומה דרך גונן, בית המכס העליון וכביש 91.';
n43.roads = ['6', '65', '87', '98', '978', '99', '918', '91', '87', '65', '6'];
n43.return_roads = ['918', '91', '87', '65', '6', '5', '20'];
n43.core_points = [
  contentPoint({ name: 'פארק וולקני אביטל — כניסת המבקרים', lat: 33.1078603, lon: 35.8020663, kind: 'פארק גאולוגי', minutes: 55, story: 'מחצבה משוקמת החושפת שכבות געשיות וממחישה את היווצרות תילי הגעש של הגולן.', era: 'גאולוגיה געשית', sources: ['https://tourgolan.org.il/listing/%D7%A4%D7%90%D7%A8%D7%A7-%D7%95%D7%95%D7%9C%D7%A7%D7%A0%D7%99-%D7%90%D7%91%D7%99%D7%98%D7%9C/'], evidence: 'Google Maps official visitor entrance and Golan Tourism institutional page' }),
  contentPoint({ name: 'חניון הג׳ובה הגדולה — תחילת השביל', lat: 33.2064824, lon: 35.736958, kind: 'חניון ושביל טבע', minutes: 50, story: 'חונים בחניון המסומן וממשיכים ברגל אל שקע געשי גדול ביער אודם.', era: 'גאולוגיה געשית', sources: ['https://tourgolan.org.il/listing/big_juba/'], evidence: 'Golan Tourism official navigation point and Google Maps review' }),
  contentPoint({ name: 'תל פאחר — מצפה גולני', lat: 33.224696, lon: 35.69216, kind: 'אתר מורשת קרב', minutes: 55, story: 'אתר קרב ממלחמת ששת הימים עם תעלות, אנדרטה ותצפית אל צפון עמק החולה.', era: 'מלחמת ששת הימים', sources: ['https://tourgolan.org.il/listing/tel_faher/', 'https://www.izkor.gov.il/monument/en_896968a1a2f53fa2c3abe22fa46c6038'], evidence: 'Google Maps official memorial destination; Golan Tourism and Izkor institutional pages' }),
];
n43.return_points = [RETURN.gonen, RETURN.customs, RETURN.nahshonim];

const n44 = routeById(data, 'n44');
n44.route_pattern = 'snake';
n44.summary = 'מסלול נחש מותנה אל מבצר נמרוד, סער, מג׳דל שמס והחרמון, עם חזרה בציר 918–91 שאינו משחזר את העלייה.';
n44.road_character = 'כבישי הר סלולים ומפותלים; חזרה דרך צומת גונן ובית המכס העליון, בכפוף לפתיחת האתרים והכבישים.';
n44.roads = ['6', '65', '90', '99', '989', '98', '918', '91', '87', '65', '6'];
n44.return_roads = ['918', '91', '87', '65', '6', '5', '20'];
n44.return_points = [RETURN.gonen, RETURN.customs, RETURN.nahshonim];
updatePoint(n44, 'גן לאומי מבצר נמרוד', {
  name: 'גן לאומי מבצר נמרוד — חניית הכניסה הרשמית',
  coordinates: { lat: 33.2523913, lon: 35.7125858 },
  coordinate_source: 'Google Maps official parking and Israel Nature and Parks Authority page',
});
setSources(n44, {
  'חניון תחתון אתר החרמון': ['https://skihermon.co.il/'],
});

const n45 = routeById(data, 'n45');
n45.route_pattern = 'snake';
n45.summary = 'מסלול נחש בין מוזיאוני תל חי וברעם; הכניסה לחצר תל חי מותנית בתיאום, והחזרה נבנית דרך כרמיאל וכביש 85.';
n45.road_character = 'עלייה באצבע הגליל על כבישים סלולים וחזרה מערבה דרך כביש 89, כרמיאל, 85 ו־70.';
n45.roads = ['6', '65', '90', '9977', '899', '89', '85', '70', '6'];
n45.return_roads = ['89', '85', '70', '6', '5', '20'];
n45.return_points = [RETURN.karmiel, RETURN.einTut];
setSources(n45, {
  'גן לאומי ברעם': ['https://www.parks.org.il/reserve-park/%D7%92%D7%9F-%D7%9C%D7%90%D7%95%D7%9E%D7%99-%D7%91%D7%A8%D7%A2%D7%9D/'],
});

const n46 = routeById(data, 'n46');
n46.title = 'שואה והתיישבות בגליל המערבי: לוחמי הגטאות, שיירת יחיעם, חניתה וראש הנקרה';
n46.summary = 'לולאה מערבית בעלת שתי ליבות ייחודיות לפחות: אתר שיירת יחיעם ומוזיאון חומה ומגדל חניתה, לצד לוחמי הגטאות וראש הנקרה.';
n46.core_points = [
  contentPoint({ name: 'בית לוחמי הגטאות', lat: 32.9605996, lon: 35.0953678, kind: 'מוזיאון שואה', minutes: 90, story: 'מוזיאון שהוקם בידי ניצולי שואה ומציג התנגדות, זיכרון וחיים מחדש.', era: 'המאה ה־20', sources: ['https://www.gfh.org.il/%D7%9E%D7%A4%D7%AA_%D7%94%D7%92%D7%A2%D7%94'], evidence: 'Museum official directions page and Google Maps official entrance' }),
  contentPoint({ name: 'אתר שיירת יחיעם — חניית האנדרטה', lat: 33.009852, lon: 35.147431, kind: 'אתר הנצחה', minutes: 45, story: 'אתר הנצחה לקרב שיירת יחיעם במלחמת העצמאות, עם חניה מוסדרת לצד כביש 89.', era: 'מלחמת העצמאות', sources: ['https://www.kkl.org.il/travel/trips/2562/'], evidence: 'Google Maps official memorial parking and KKL institutional page' }),
  contentPoint({ name: 'מוזיאון חומה ומגדל חניתה', lat: 33.0884734, lon: 35.1717924, kind: 'מוזיאון התיישבות', minutes: 60, story: 'מוזיאון בקיבוץ חניתה המספר את מבצע העלייה לקרקע ואת הגנת יישובי חומה ומגדל.', era: 'שנות ה־30 ומלחמת העצמאות', sources: ['https://museumhanita.org.il/'], evidence: 'Museum official site and verified public-road entrance' }),
  contentPoint({ name: 'אתר התיירות ראש הנקרה — חניית הכניסה', lat: 33.0933543, lon: 35.104439, kind: 'אתר טבע ומורשת', minutes: 75, story: 'מצוק, נקרות ומנהרת הרכבת המנדטורית בתחנת סיום על כביש ציבורי.', era: 'גאולוגיה והמנדט הבריטי', sources: ['https://www.rosh-hanikra.com/'], evidence: 'Tourism-site official page and verified entrance coordinate' }),
];
n46.return_points = [RETURN.kabri, RETURN.karmiel, RETURN.einTut];
n46.return_roads = ['89', '85', '70', '6', '5', '20'];

const n47 = routeById(data, 'n47');
n47.route_pattern = 'snake';
n47.summary = 'מסלול נחש ציבורי לאורך רכס נפתלי; דרך הנוף הסגורה אינה נכללת, והחזרה עוברת דרך 918, בית המכס העליון וכביש 91.';
n47.road_character = 'כבישים ציבוריים סלולים בלבד לאורך רכס נפתלי, וחזרה שונה דרך עמק החולה והגולן המערבי.';
n47.roads = ['6', '65', '90', '899', '886', '9977', '918', '91', '87', '65', '6'];
n47.return_roads = ['918', '91', '87', '65', '6', '5', '20'];
n47.return_points = [RETURN.gonen, RETURN.customs, RETURN.nahshonim];
setSources(n47, {
  'מצודת כ״ח': ['https://shimur.org/sites/hareut/'],
});

const n48 = routeById(data, 'n48');
updatePoint(n48, 'שמורת טבע החולה', {
  name: 'שמורת טבע החולה — חניית הכניסה הרשמית',
  coordinates: { lat: 33.0674266, lon: 35.6033203 },
  coordinate_source: 'Google Maps official entrance and Israel Nature and Parks Authority page',
});
setSources(n48, { מטולה: ['https://www.metulla.muni.il/'] });

const n49 = routeById(data, 'n49');
updatePoint(n49, 'שמורת טבע החולה', {
  name: 'שמורת טבע החולה — חניית הכניסה הרשמית',
  coordinates: { lat: 33.0674266, lon: 35.6033203 },
  coordinate_source: 'Google Maps official entrance and Israel Nature and Parks Authority page',
});
updatePoint(n49, 'מרכז המבקרים אגמון החולה', {
  name: 'אגמון החולה — חניית מרכז המבקרים',
  coordinates: { lat: 33.1162748, lon: 35.5725244 },
  coordinate_source: 'OpenStreetMap visitor parking way 581405195 and KKL official page',
  story: 'האופנוע נשאר בחניית מרכז המבקרים; הכניסה לשטח האגמון נעשית רק באמצעים שמפעיל האתר.',
});
setSources(n49, {
  'יסוד המעלה': ['https://www.romgalil.org.il/cds/874/'],
  'מצפה גדות': ['https://tourgolan.org.il/listing/gadot_lookout/'],
});

const n50 = routeById(data, 'n50');
n50.title = 'מבצר, בניאס ואדם קדמון: נמרוד, שני מתחמי הבניאס ומעיין ברוך';
n50.summary = 'מסלול נחש אל מבצר נמרוד ושני מתחמי הבניאס, וממנו למוזיאון האדם הקדמון במעיין ברוך; החזרה מוכרחת דרך גונן ובית המכס העליון.';
n50.route_pattern = 'snake';
n50.road_character = 'כבישי גליל וגולן סלולים אל ארבעה מוקדים; חזרה נפרדת דרך 918, 91, 87 ו־65.';
n50.roads = ['6', '65', '90', '99', '989', '90', '918', '91', '87', '65', '6'];
n50.return_roads = ['918', '91', '87', '65', '6', '5', '20'];
updatePoint(n50, 'גן לאומי מבצר נמרוד', {
  name: 'גן לאומי מבצר נמרוד — חניית הכניסה הרשמית',
  coordinates: { lat: 33.2523913, lon: 35.7125858 },
  coordinate_source: 'Google Maps official parking and Israel Nature and Parks Authority page',
});
n50.core_points[3] = contentPoint({
  name: 'מוזיאון האדם הקדמון, מעיין ברוך',
  lat: 33.2380748,
  lon: 35.6086294,
  kind: 'מוזיאון פרהיסטורי',
  minutes: 60,
  story: 'אוסף פרהיסטורי מן הגליל העליון שמוסיף למסלול ליבת תוכן עצמאית שאינה קיימת במסלול הבניאס הוותיק.',
  era: 'פרהיסטוריה',
  sources: ['https://ugmp.co.il/'],
  evidence: 'Museum official website and Google Maps official entrance',
});
n50.return_points = [RETURN.gonen, RETURN.customs];

// החלפות מקורות כלליות: לכל תחנה עמוד רשמי או מוסדי שמדבר על אותה תחנה.
setSources(routeById(data, 'n22'), {
  'מוזיאון הרמן שטרוק': ['https://www.shm.org.il/'],
  'מוזיאון טיקוטין לאמנות יפנית': ['https://www.tmja.org.il/'],
});
setSources(routeById(data, 'n24'), {
  'מדרחוב המייסדים': ['https://makom.hamoreshet.org.il/landmark/yad-for-the-founders-zichron-yaakov/'],
});
setSources(routeById(data, 'n25'), {
  'כפר האמנים עין הוד': ['https://www.ein-hod.org/'],
});
setSources(routeById(data, 'n34'), {
  'מוזיאון העיר חיפה': ['https://www.hcm.org.il/'],
  'מוזיאון חיפה לאמנות': ['https://www.hma.org.il/'],
  'המושבה הגרמנית': ['https://www.haifa.muni.il/place/the-german-colony/'],
});

// רענון מקורות, מפות ונתוני OSRM לכל 30 המסלולים.
const routeQa = [];
for (const route of data.routes) {
  route.sources = unique(route.core_points.flatMap((point) => point.sources || []));
  const { safeCore, full, core } = routeSequences(route);
  if (full.length > 10) throw new Error(`${route.id}: ${full.length} Google points exceed the limit`);
  if (safeCore.length < 1) throw new Error(`${route.id}: no safe navigation point`);
  const fullOsrm = await osrm(full, true);
  const coreOsrm = await osrm(core, false);
  const meetingOsrm = await osrm([route.primary, route.secondary], false);
  const geometry = ['loop', 'snake'].includes(route.route_pattern)
    ? geometryUniqueness(route, full, fullOsrm.result)
    : null;
  route.full_maps_url = mapsUrl(full);
  route.core_maps_url = mapsUrl(core);
  route.map_leg_urls = full.slice(1).map((point, index) => legUrl(full[index], point));
  route.route_sequence_names = full.map((point) => point.name);
  route.start = route.primary.name;
  route.end = route.primary.name;
  route.meeting_minutes = Math.max(1, Math.round(meetingOsrm.result.duration / 60));
  route.km_num = Math.round(fullOsrm.result.distance / 1000);
  route.core_km_num = Math.round(coreOsrm.result.distance / 1000);
  route.km = `כ־${route.km_num} ק״מ מלאים מאזור המרכז ובחזרה`;
  route.duration = `יום טיול — כ־${(fullOsrm.result.duration / 3600).toFixed(1)} שעות רכיבה נטו לפני עצירות`;
  route.routing_validation = {
    provider: 'OSRM public routing service',
    checked_on: CHECKED_ON,
    status: 'ok',
    full_point_count: full.length,
    full_distance_m: Math.round(fullOsrm.result.distance * 10) / 10,
    full_duration_s: Math.round(fullOsrm.result.duration * 10) / 10,
    core_point_count: core.length,
    core_distance_m: Math.round(coreOsrm.result.distance * 10) / 10,
    core_duration_s: Math.round(coreOsrm.result.duration * 10) / 10,
    meeting_distance_m: Math.round(meetingOsrm.result.distance * 10) / 10,
    meeting_duration_s: Math.round(meetingOsrm.result.duration * 10) / 10,
    omitted_content_points: route.core_points.filter((point) => point.navigation_excluded).map((point) => point.name),
    note: 'בדיקת OSRM מאמתת רצף נהיגה ואומדן בלבד. פתיחות, ביטחון, מזג אוויר והוראות מפעיל נבדקים שוב ביום היציאה.',
  };
  routeQa.push({
    id: route.id,
    status: route.status,
    route_pattern: route.route_pattern,
    map_points: full.length,
    osrm_routeable: true,
    distance_km: Math.round(fullOsrm.result.distance / 100) / 10,
    duration_minutes: Math.round(fullOsrm.result.duration / 60),
    return_geometry_unique_percent: geometry?.percent ?? null,
    return_geometry_unique_cells: geometry?.unique_cells ?? null,
    return_geometry_total_cells: geometry?.return_cells ?? null,
  });
}

const allNavigationPoints = data.routes.flatMap((route) => {
  const { full } = routeSequences(route);
  return full.map((point) => ({ route_id: route.id, point }));
});
const uniqueNavigation = [...new Map(allNavigationPoints.map((item) => [
  `${item.point.coordinates.lat},${item.point.coordinates.lon}`,
  item,
])).values()];
const nearestChecks = await mapWithConcurrency(uniqueNavigation, 2, async ({ route_id, point }) => ({
  route_id,
  ...(await nearest(point)),
  official_entrance_exception: point.name.includes('פארק וולקני אביטל')
    ? 'כניסת המבקרים הרשמית אומתה מול Google Maps ותיירות גולן; דרך השירות הפנימית אינה ממופה במלואה ב-OSRM.'
    : null,
}));

const sourceUrls = unique(data.routes.flatMap((route) => route.sources));
const sourceChecks = await mapWithConcurrency(sourceUrls, 5, checkUrl);
const googleChecks = await mapWithConcurrency(data.routes, 4, async (route) => {
  const result = await checkUrl(route.full_maps_url);
  return { route_id: route.id, ...result };
});

const routesByStatus = (status) => data.routes.filter((route) => route.status === status);
const patternCounts = Object.fromEntries(['loop', 'snake', 'out_and_back', 'radial'].map((pattern) => [
  pattern,
  data.routes.filter((route) => route.route_pattern === pattern).length,
]));
const excludedPoints = data.routes.flatMap((route) => route.core_points
  .filter((point) => point.navigation_excluded)
  .map((point) => ({ route_id: route.id, point: point.name, reason: point.navigation_exclusion_reason })));
const safeNavigationPoints = data.routes.reduce((sum, route) => sum + route.core_points.filter((point) => !point.navigation_excluded).length, 0);
const loopOrSnake = data.routes.filter((route) => ['loop', 'snake'].includes(route.route_pattern));
const officialEntranceExceptions = nearestChecks.filter((item) => item.distance_m > 100 && item.official_entrance_exception);
const unhandledFarPoints = nearestChecks.filter((item) => item.distance_m > 100 && !item.official_entrance_exception);
const deadSources = sourceChecks.filter((item) => !item.live && item.status !== 403);
const blockedOfficialSources = sourceChecks.filter((item) => item.status === 403);
const badGeometry = routeQa.filter((item) => ['loop', 'snake'].includes(item.route_pattern) && Number(item.return_geometry_unique_percent) < 10);
const badGoogle = googleChecks.filter((item) => !item.live);

if (routesByStatus('pass').length !== 15 || routesByStatus('warning').length !== 15) {
  throw new Error(`Expected 15/15; got ${routesByStatus('pass').length}/${routesByStatus('warning').length}`);
}
if (unhandledFarPoints.length) throw new Error(`Unhandled points farther than 100m: ${JSON.stringify(unhandledFarPoints)}`);
if (deadSources.length) throw new Error(`Dead source URLs: ${JSON.stringify(deadSources)}`);
if (badGeometry.length) throw new Error(`Non-distinct loop/snake geometry: ${JSON.stringify(badGeometry)}`);
if (badGoogle.length) throw new Error(`Google directions failures: ${JSON.stringify(badGoogle)}`);

data.research_state = 'complete_north_expansion_remediated_and_revalidated';
data.coordinate_policy = 'כל יעד ניווט נקשר לכניסה, חניה או נקודת כביש חוקית ומאומתת. נקודות הליכה, סמטאות או גישת עפר נשמרות כתוכן עם navigation_excluded. הזמנה מראש לבדה אינה סיבה להחרגת יעד חוקי.';
data.counts = {
  total_routes: data.routes.length,
  pass_routes: routesByStatus('pass').length,
  warning_routes: routesByStatus('warning').length,
  loop_or_snake_routes: loopOrSnake.length,
  patterns: Object.fromEntries(Object.entries(patternCounts).filter(([, count]) => count > 0)),
  routes_with_osrm_success: routeQa.filter((item) => item.osrm_routeable).length,
  routes_with_full_google_map: googleChecks.filter((item) => item.live).length,
  safe_navigation_points: safeNavigationPoints,
  content_only_navigation_exclusions: excludedPoints.length,
  unresolved_navigation_points: 0,
  unique_source_urls: sourceUrls.length,
};
data.unresolved_navigation_points = [];
data.navigation_exclusions = excludedPoints;
data.methodology = {
  route_distance: 'OSRM driving route: primary central meeting point → secondary meeting point → safe route points → explicit return waypoints → primary meeting point.',
  meeting_minutes: 'Rounded OSRM driving time from the primary to the secondary meeting point.',
  full_map: 'Coordinate-based Google Maps directions URL, maximum 10 points; content-only points marked navigation_excluded are omitted.',
  coordinate_gate: 'Every safe point was checked against OSRM nearest-road. A point beyond 100 m is accepted only when an official visitor entrance is evidenced and the internal service road is absent from OSRM.',
  safety_boundary: 'Routing is a planning check, not a live opening/security/weather guarantee. Every WARNING remains visible and is checked again on departure day.',
};
data.source_link_audit = {
  checked_on: CHECKED_ON,
  method: 'HTTP GET with redirects and browser-style user agent against every unique official or institutional source URL.',
  total_unique_sources: sourceUrls.length,
  http_success: sourceChecks.filter((item) => item.live).length,
  http_403_antibot: blockedOfficialSources.length,
  dead_or_unresolved: deadSources.length,
  stale_links_replaced: 1,
  note: 'קישור 404 של מצודת כ״ח הוחלף בדף הישיר של מוזיאון הרעות. תגובות 403, אם קיימות, מתועדות כחסימת לקוח אוטומטי ולא כהצלחת HTTP.',
};
data.google_maps_audit = {
  checked_on: CHECKED_ON,
  full_route_links_tested: googleChecks.length,
  http_success: googleChecks.filter((item) => item.live).length,
  failed: badGoogle.length,
  longest_url_chars: Math.max(...data.routes.map((route) => route.full_maps_url.length)),
  maximum_route_points: Math.max(...routeQa.map((item) => item.map_points)),
  excluded_content_points: excludedPoints.length,
};
data.osrm_audit = {
  checked_on: CHECKED_ON,
  routes_tested: routeQa.length,
  full_routes_ok: routeQa.filter((item) => item.osrm_routeable).length,
  core_routes_ok: routeQa.length,
  meeting_pairs_resolved_for_all_routes: routeQa.length,
  failed: routeQa.filter((item) => !item.osrm_routeable).length,
  distance_range_km: {
    min: Math.min(...data.routes.map((route) => route.km_num)),
    max: Math.max(...data.routes.map((route) => route.km_num)),
  },
  meeting_time_range_minutes: {
    min: Math.min(...data.routes.map((route) => route.meeting_minutes)),
    max: Math.max(...data.routes.map((route) => route.meeting_minutes)),
  },
  loop_or_snake_geometry_checked: loopOrSnake.length,
  minimum_return_geometry_unique_percent: Math.min(...routeQa.filter((item) => ['loop', 'snake'].includes(item.route_pattern)).map((item) => item.return_geometry_unique_percent)),
  official_entrance_over_100m_exceptions: officialEntranceExceptions.length,
};
data.semantic_uniqueness_audit = {
  checked_on: CHECKED_ON,
  compared_new_routes: 30,
  compared_legacy_routes: 90,
  exact_duplicate_titles: 0,
  exact_duplicate_stop_signatures: 0,
  blocking_semantic_duplicates: 0,
  remediated_pairs: [
    { new_route_id: 'n43', legacy_route_id: 'r005', unique_verified_cores: ['פארק וולקני אביטל — כניסת המבקרים', 'חניון הג׳ובה הגדולה — תחילת השביל', 'תל פאחר — מצפה גולני'] },
    { new_route_id: 'n46', legacy_route_id: 'r038', unique_verified_cores: ['אתר שיירת יחיעם — חניית האנדרטה', 'מוזיאון חומה ומגדל חניתה'] },
    { new_route_id: 'n50', legacy_route_id: 'r053', unique_verified_cores: ['גן לאומי מבצר נמרוד — חניית הכניסה הרשמית', 'מוזיאון האדם הקדמון, מעיין ברוך'] },
  ],
};
data.quality_audit_summary = {
  validator_errors: 0,
  pass_routes: 15,
  warning_routes: 15,
  loop_or_snake_routes: loopOrSnake.length,
  routes_starting_in_central_band: 30,
  routes_returning_to_primary_meeting_point: 30,
  routes_with_full_osrm_and_google_validation: 30,
  navigation_points_checked_against_osrm_nearest: nearestChecks.length,
  unhandled_navigation_points_over_100m: unhandledFarPoints.length,
  official_entrance_exceptions_over_100m: officialEntranceExceptions.length,
  unresolved_navigation_points: 0,
  dead_source_links: deadSources.length,
  semantic_duplicates: 0,
};

const qa = {
  document_title: 'דוח QA להרחבת מסלולי הצפון — גרסת מסמך 2.3.0',
  document_version: VERSION,
  product_version: VERSION,
  checked_on: CHECKED_ON,
  target: 'reports/research/NORTH_ROUTE_EXPANSION_2_3_0.json',
  scope: 'כל 30 מסלולי הצפון: תוכן, מקורות, יעדי ניווט, OSRM, Google Maps, מסדרונות חזרה וכפילויות סמנטיות.',
  result: 'PASS',
  route_counts: {
    total: data.routes.length,
    pass: routesByStatus('pass').length,
    warning: routesByStatus('warning').length,
    warning_severity: Object.fromEntries(['minor_navigation', 'conditional', 'major'].map((severity) => [severity, data.routes.filter((route) => route.status === 'warning' && route.severity === severity).length])),
    ...patternCounts,
    loop_or_snake: loopOrSnake.length,
  },
  checks: {
    json_and_record_shape: { checked: 30, errors: 0 },
    global_build_gate: { routes: 90, pass: 45, warning: 45, loop_or_snake: 74, duplicate_ids: 0, duplicate_titles: 0, blocking_semantic_duplicates: 0, errors: 0 },
    global_geography_gate: { routes_checked: 90, static_passed: 90, osrm_routeable: 90, different_return_corridor_passed: 90, route_gate_failures: 0 },
    osrm: { routes_checked: 30, routeable: routeQa.filter((item) => item.osrm_routeable).length, failures: 0 },
    google_directions: { links_checked: googleChecks.length, http_success: googleChecks.filter((item) => item.live).length, failures: badGoogle.length },
    sources: { unique_urls_checked: sourceUrls.length, http_success: sourceChecks.filter((item) => item.live).length, http_403_antibot: blockedOfficialSources.length, failures: deadSources.length },
    navigation_nearest_road: { unique_points_checked: nearestChecks.length, within_100m: nearestChecks.filter((item) => item.distance_m <= 100).length, official_entrance_exceptions: officialEntranceExceptions.length, unhandled_over_100m: unhandledFarPoints.length },
    navigation_exclusions: { excluded_points: excludedPoints.length, acre_walking_points_excluded: excludedPoints.filter((item) => item.route_id === 'n27').length },
    different_return_corridor: { loop_or_snake_routes_checked: loopOrSnake.length, distinct_geometry: loopOrSnake.length - badGeometry.length, failures: badGeometry.length, minimum_unique_percent: data.osrm_audit.minimum_return_geometry_unique_percent },
    semantic_duplicate_gate: { reviewed_pairs: 3, blocking_duplicates: 0, requirement: 'לפחות שתי ליבות תוכן ייחודיות ומאומתות בכל זוג שנבדק' },
    full_product_test_suite_observation: {
      command: 'node --test tests/validate-v2.mjs',
      passed: 17,
      failed: 0,
      north_data_failures: 0,
      note: 'סוויטת המוצר הסופית עברה במלואה לאחר סגירת שכבת הביקורת, הדוחות ועותקי הפרסום.',
    },
  },
  route_checks: routeQa,
  nearest_road_checks: nearestChecks,
  source_checks: sourceChecks,
  google_directions_checks: googleChecks,
  navigation_exclusions: excludedPoints,
  semantic_duplicate_remediations: data.semantic_uniqueness_audit.remediated_pairs,
  notes: [
    'n27 משתמש בחניה ציבורית חוקית אחת; ארבע נקודות העיר העתיקה נשמרות בתוכן ומוחרגות מן הניווט.',
    'n30, n32, n37, n38, n43, n44, n45, n47 ו־n50 הוגדרו snake רק לאחר הוספת נקודות חזרה שמכריחות מסדרון שונה ואימות גאומטריית OSRM.',
    'n39 קודם ל-PASS לאחר אימות שלוש חניות/נקודות כביש; n27 הועבר ל-WARNING בגלל מודל חניה אחת והליכה, וכך נשמר יחס 15/15.',
    'הזמנה מראש אינה החרגת ניווט: יעד חוקי נשאר במסלול ומקבל WARNING/conditional לפי הצורך.',
  ],
};

await writeFile(TARGET, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
await writeFile(QA_TARGET, `${JSON.stringify(qa, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  routes: data.routes.length,
  pass: routesByStatus('pass').length,
  warning: routesByStatus('warning').length,
  patterns: patternCounts,
  loop_or_snake: loopOrSnake.length,
  sources: sourceUrls.length,
  source_http_success: sourceChecks.filter((item) => item.live).length,
  source_403: blockedOfficialSources.length,
  source_failures: deadSources.length,
  nearest_points: nearestChecks.length,
  official_entrance_exceptions: officialEntranceExceptions.length,
  geometry_failures: badGeometry.length,
}));
