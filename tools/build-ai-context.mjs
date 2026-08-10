/**
 * יצירת תיקי מסלול לעוזר המסלול ולשירות AI אופציונלי
 * גרסה: 2.2.0
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const EXPECTED = Object.freeze({ legacy: 90, candidates: 53, routes: 143, stops: 659 });

function parseLegacy(source) {
  const marker = 'window.ROAD_BOOK_LEGACY = ';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('ROAD_BOOK_LEGACY not found');
  return JSON.parse(source.slice(start + marker.length).replace(/;\s*$/, ''));
}

function parseCandidateData(source) {
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: 'data/new-routes-v2.js', timeout: 5_000 });
  return {
    variants: sandbox.window.ROAD_BOOK_V2_VARIANTS || [],
    candidates: sandbox.window.ROAD_BOOK_V2_CANDIDATES || [],
  };
}

function sourceRecords(routeId, urls = []) {
  return urls.map((url, index) => ({
    source_id: `${routeId}-src-${String(index + 1).padStart(2, '0')}`,
    url,
    scope: 'route',
  }));
}

function supportForLegacy(route) {
  return route.verification_level === 'מאומת ממקורות'
    ? 'route_scope'
    : 'limited_route_scope';
}

function legacyContext(route) {
  const sources = sourceRecords(route.id, route.sources);
  return {
    route_id: route.id,
    route_kind: 'legacy',
    support_level: supportForLegacy(route),
    verification_level: route.verification_level,
    verification_note: route.verification_note,
    title: route.title,
    region: route.region,
    area: route.area,
    level: route.level,
    road_character: route.road_character || route.style,
    start: route.start,
    end: route.end,
    duration: route.duration,
    km: route.km,
    roads: route.roads,
    best: route.best,
    summary: route.summary,
    story: route.story_big,
    cautions: route.cautions,
    fuel: route.fuel,
    checked_on: route.checked_on,
    route_points: [route.start, ...(route.stops || []).map((stop) => stop.name), route.end].filter(Boolean),
    sources,
    source_scope_note: 'המקורות משויכים למסלול כולו ולא לכל טענה בנפרד.',
    stops: (route.stops || []).map((stop, index) => ({
      stop_id: `${route.id}-s${String(index + 1).padStart(3, '0')}`,
      name: stop.name,
      kind: stop.kind,
      story: stop.story_long || stop.story,
      era: stop.era,
      minutes: Number(stop.minutes) || 0,
      source_ids: sources.map((item) => item.source_id),
    })),
  };
}

function candidateContext(spec) {
  const routeId = `v2-${spec.id}`;
  const points = (spec.points || []).filter(Boolean);
  const sources = sourceRecords(routeId, spec.sources);
  return {
    route_id: routeId,
    route_kind: 'candidate',
    support_level: 'candidate_scope',
    verification_level: 'מועמד באימות',
    verification_note: `דרגת מחקר ${spec.grade || 'B'}. לפני שדרוג נדרשים Place IDs, בדיקת כבישים סלולים, מפה מלאה, מרחק, זמן ונסיעת ביקורת.`,
    title: spec.title,
    region: spec.region,
    area: spec.region,
    level: spec.level,
    road_character: spec.road,
    start: points[0] || null,
    end: points.at(-1) || null,
    duration: null,
    km: null,
    roads: null,
    best: null,
    summary: 'ציר שנבדק כמועמד על בסיס רשימת נקודות ומקורות. הוא אינו מסלול רכיבה מאושר.',
    story: points.length ? `נקודות הציר הרשומות בספר: ${points.join(' ← ')}.` : null,
    cautions: spec.note || 'יש לבדוק סלילה, חסימות, חניה, שעות פתיחה, מצב ביטחוני ומזג אוויר לפני שימוש.',
    fuel: null,
    checked_on: '05.08.2026 — בדיקת מקורות ראשונית בלבד',
    route_points: points,
    sources,
    source_scope_note: 'זהו תיק מועמד מוגבל. המקורות משויכים לציר כולו, ולעיתים הם דפי מידע כלליים; אין שיוך של מקור לכל נקודה או טענה.',
    stops: points.slice(1, -1).map((name, index) => ({
      stop_id: `${routeId}-s${String(index + 1).padStart(3, '0')}`,
      name,
      kind: 'נקודת מועמד לאימות',
      story: 'הנקודה מופיעה ברשימת הציר. טרם נוסף לה בספר הסבר עובדתי מאומת.',
      era: null,
      minutes: 0,
      source_ids: sources.map((item) => item.source_id),
    })),
  };
}

function validateContexts(routes, counts) {
  if (counts.legacy !== EXPECTED.legacy || counts.candidates !== EXPECTED.candidates) {
    throw new Error(`Unexpected input counts: ${JSON.stringify(counts)}`);
  }
  const values = Object.values(routes);
  if (values.length !== EXPECTED.routes) throw new Error(`Expected ${EXPECTED.routes} routes, received ${values.length}`);

  const routeIds = new Set();
  const stopIds = new Set();
  let stopCount = 0;
  for (const route of values) {
    if (routeIds.has(route.route_id)) throw new Error(`Duplicate route ID: ${route.route_id}`);
    routeIds.add(route.route_id);
    if (!['route_scope', 'limited_route_scope', 'candidate_scope'].includes(route.support_level)) {
      throw new Error(`Invalid support level for ${route.route_id}`);
    }
    if (!route.title || !route.verification_level || !route.verification_note || !route.sources.length) {
      throw new Error(`Incomplete route dossier: ${route.route_id}`);
    }
    const sourceIds = new Set(route.sources.map((source) => source.source_id));
    for (const stop of route.stops) {
      stopCount += 1;
      if (stopIds.has(stop.stop_id)) throw new Error(`Duplicate stop ID: ${stop.stop_id}`);
      stopIds.add(stop.stop_id);
      if (!stop.name || !stop.story || !stop.source_ids.every((id) => sourceIds.has(id))) {
        throw new Error(`Incomplete stop dossier: ${stop.stop_id}`);
      }
    }
  }
  if (stopCount !== EXPECTED.stops) throw new Error(`Expected ${EXPECTED.stops} stops, received ${stopCount}`);
}

const [legacySource, candidateSource] = await Promise.all([
  readFile(join(ROOT, 'data', 'legacy-content-v2.js'), 'utf8'),
  readFile(join(ROOT, 'data', 'new-routes-v2.js'), 'utf8'),
]);
const legacy = parseLegacy(legacySource);
const candidateData = parseCandidateData(candidateSource);
if (candidateData.variants.length) throw new Error('Route variants require an explicit context policy before generation');

const allContexts = [
  ...(legacy.routes || []).map(legacyContext),
  ...candidateData.candidates.map(candidateContext),
];
const routes = Object.fromEntries(allContexts.map((route) => [route.route_id, route]));
validateContexts(routes, { legacy: legacy.routes.length, candidates: candidateData.candidates.length });

const output = `/**\n * תיקי מסלול שנוצרו אוטומטית לעוזר המסלול\n * גרסה: 2.2.0\n * 143 מסלולים; רמת התמיכה והאימות נשמרת בכל תיק בנפרד.\n * המקורות משויכים ברמת המסלול ואין לטעון לשיוך מדויק לכל טענה.\n */\nexport const ROUTE_CONTEXT = ${JSON.stringify(routes, null, 2)};\n`;
await writeFile(join(ROOT, 'api-worker', 'src', 'context.generated.js'), output, 'utf8');

const support = Object.values(routes).reduce((result, route) => {
  result[route.support_level] = (result[route.support_level] || 0) + 1;
  return result;
}, {});
console.log(JSON.stringify({ routes: Object.keys(routes).length, stops: EXPECTED.stops, support }));
