/**
 * בניית הרחבת קטלוג המסלולים — גרסת מסמך 2.3.1
 * גרסת מוצר: 2.3.0
 *
 * קובץ היעד נוצר מכנית משלושת תיקי המחקר. אין כאן השלמת עובדות חסרות:
 * שער הבנייה נכשל אם רשומת PASS חסרה נתון, מקור או נקודת ניווט מאומתת.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '2.3.0';
const INPUTS = [
  'reports/research/NORTH_ROUTE_EXPANSION_2_3_0.json',
  'reports/research/SOUTH_ROUTE_EXPANSION_2_3_0.json',
  'reports/research/CENTRAL_EAST_ROUTE_EXPANSION_2_3_0.json',
];
const OUTPUT = 'data/route-expansion-v2.3.0.js';
const STATUS_VALUES = new Set(['pass', 'warning']);
const SEVERITY_VALUES = new Set(['minor_navigation', 'conditional', 'major']);
const PATTERN_VALUES = new Set(['radial', 'out_and_back', 'loop', 'snake']);
const CENTRAL_BAND = Object.freeze({ minLat: 31.78, maxLat: 32.12, minLon: 34.72, maxLon: 34.83 });

function clean(value) {
  return String(value ?? '').trim();
}

function prose(value) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean).join(' • ') : clean(value);
}

function listText(value) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean).join(', ') : clean(value);
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function canonicalText(value) {
  return clean(value).toLocaleLowerCase('he').replace(/[״׳"'–—־,:()]/g, '').replace(/\s+/g, ' ');
}

function canonicalPlace(value) {
  return canonicalText(value)
    .replace(/^(?:גן לאומי|שמורת טבע|מרכז המבקרים(?: של)?|חניון|פארק|מוזאון|מוזיאון)\s+/, '')
    .replace(/\s+(?:נקודת ניווט כללית|נקודת מעבר בלבד|נקודת הקהילה|גישה לפארק|סגור.*)$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function routePointSet(route) {
  const contentPoints = Array.isArray(route.stops) && route.stops.length
    ? route.stops.map((stop) => stop.name || stop.navigation_name)
    : (route.map_points || [route.start, route.end]);
  return new Set(contentPoints
    .map(canonicalPlace).filter(Boolean));
}

function substantiallyDuplicates(candidate, reference) {
  if (candidate.size < 2 || reference.size < 2) return false;
  const intersection = [...candidate].filter((value) => reference.has(value)).length;
  // מסלול חדש חייב להביא לפחות שתי נקודות ליבה שאינן כבר יחד במסלול ההשוואה.
  return intersection >= 2 && candidate.size - intersection < 2;
}

function haversineKm(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const radians = (value) => value * Math.PI / 180;
  const deltaLat = radians(b.lat - a.lat);
  const deltaLon = radians(b.lon - a.lon);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function assignGeographicConnections(records) {
  for (const record of records) {
    if (record.route.connections.length) continue;
    const end = record.route.navigation_coordinates.at(-1);
    record.route.connections = records
      .filter((candidate) => candidate.route.id !== record.route.id)
      .map((candidate) => ({
        id: candidate.route.id,
        distance: haversineKm(end, candidate.route.navigation_coordinates[0]),
        sameDirection: candidate.route.star_direction === record.route.star_direction,
      }))
      .filter((candidate) => Number.isFinite(candidate.distance) && candidate.distance <= 60)
      .sort((a, b) => Number(b.sameDirection) - Number(a.sameDirection) || a.distance - b.distance)
      .slice(0, 3)
      .map((candidate) => candidate.id);
  }
}

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function urls(values = []) {
  return unique(values.map(httpsUrl).filter(Boolean));
}

function pointName(point) {
  if (typeof point === 'string') return clean(point);
  const navigation = clean(point?.navigation);
  return clean(point?.name || point?.place || (!/^https?:\/\//i.test(navigation) ? navigation : ''));
}

function pointCoordinates(point) {
  const coordinates = typeof point === 'object' ? (point.coordinates || point.coordinate || point) : {};
  const lat = Number(Array.isArray(coordinates) ? coordinates[0] : coordinates?.lat);
  const lon = Number(Array.isArray(coordinates) ? coordinates[1] : (coordinates?.lon ?? coordinates?.lng));
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function pointReviewState(point) {
  return clean(point?.coordinate_match?.review_state || point?.review_state).toLowerCase();
}

function pointNavigationExcluded(point) {
  return Boolean(point && typeof point === 'object' && point.navigation_excluded === true);
}

function insideCentralBand(coordinates) {
  return coordinates
    && coordinates.lat >= CENTRAL_BAND.minLat && coordinates.lat <= CENTRAL_BAND.maxLat
    && coordinates.lon >= CENTRAL_BAND.minLon && coordinates.lon <= CENTRAL_BAND.maxLon;
}

function ordered(values = []) {
  return values.map(pointName).filter(Boolean)
    .filter((value, index, all) => index === 0 || value !== all[index - 1]);
}

function mapsUrl(points) {
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

function coordinateMapsUrl(points, coordinates) {
  if (coordinates.length !== points.length || coordinates.some((point) => !point)) return mapsUrl(points);
  const values = coordinates.map((point) => `${point.lat},${point.lon}`);
  const params = new URLSearchParams({
    api: '1',
    origin: values[0],
    destination: values.at(-1),
    travelmode: 'driving',
  });
  if (values.length > 2) params.set('waypoints', values.slice(1, -1).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function starDirection(value, region) {
  const text = `${clean(value)} ${clean(region)}`;
  if (/north|צפון|גליל|גולן/i.test(text)) return 'north';
  if (/south|דרום|נגב|ערבה|אילת/i.test(text)) return 'south';
  if (/east|מזרח|ירושלים|ים המלח|בקעה/i.test(text)) return 'east';
  return 'center';
}

function roadProfile(character = '') {
  const value = clean(character);
  if (/מדברי|פתוח/.test(value)) return { fast: 50, twisty: 15, local: 30, urban: 5 };
  if (/מהיר/.test(value)) return { fast: 60, twisty: 10, local: 20, urban: 10 };
  if (/מפותל|הררי/.test(value)) return { fast: 20, twisty: 50, local: 25, urban: 5 };
  if (/עירוני/.test(value)) return { fast: 15, twisty: 10, local: 30, urban: 45 };
  if (/כפרי|שקט/.test(value)) return { fast: 20, twisty: 25, local: 45, urban: 10 };
  return { fast: 30, twisty: 25, local: 35, urban: 10 };
}

function stopRecord(point, index) {
  const name = pointName(point);
  const sourceUrls = urls(point?.sources || []);
  const navigationExcluded = pointNavigationExcluded(point);
  return {
    name,
    navigation_name: navigationExcluded ? null : name,
    navigation_excluded: navigationExcluded,
    navigation_exclusion_reason: navigationExcluded ? clean(point?.navigation_exclusion_reason) : '',
    researched_navigation_url: httpsUrl(point?.navigation),
    coordinates: pointCoordinates(point),
    coordinate_review_state: pointReviewState(point),
    kind: clean(point?.kind) || 'עצירת דרך',
    minutes: Number(point?.minutes),
    story: clean(point?.story),
    story_long: clean(point?.story_long) || clean(point?.story),
    era: clean(point?.era) || 'ללא תקופה מרכזית',
    fuel: Boolean(point?.fuel),
    sources: sourceUrls,
    index: index + 1,
  };
}

function normalizeRoute(spec, inputName, ordinal) {
  const status = clean(spec.status).toLowerCase();
  const severity = clean(spec.severity).toLowerCase();
  const pattern = clean(spec.route_pattern || 'radial').toLowerCase();
  const primary = spec.primary || spec.meeting_primary;
  const corePoints = spec.core_points || spec.points || [];
  const navigationCorePoints = corePoints.filter((point) => !pointNavigationExcluded(point));
  const secondary = spec.secondary || spec.meeting_secondary || navigationCorePoints[0];
  const returnPoints = spec.return_points || [];
  const sourceUrls = urls(spec.sources || []);
  const stops = corePoints.map((point, index) => stopRecord(point, index));
  const allSourceUrls = urls([...sourceUrls, ...stops.flatMap((stop) => stop.sources)]);
  const coreNames = ordered(navigationCorePoints);
  const returnNames = ordered(returnPoints);
  const primaryName = pointName(primary);
  const secondaryName = pointName(secondary) || coreNames[0];
  const fullPointObjects = [
    primary,
    secondary || navigationCorePoints[0],
    ...navigationCorePoints,
    ...returnPoints,
    ...(['loop', 'snake', 'out_and_back'].includes(pattern) ? [primary] : []),
  ].filter((point) => pointName(point))
    .filter((point, index, all) => index === 0 || pointName(point) !== pointName(all[index - 1]));
  const fullPoints = fullPointObjects.map(pointName);
  const profile = spec.road_profile || roadProfile(spec.road_character);
  const warningReason = clean(spec.warning_reason);
  const route = {
    id: clean(spec.id),
    title: clean(spec.title),
    region: clean(spec.region),
    area: clean(spec.area || spec.region),
    duration: clean(spec.duration),
    km: clean(spec.km),
    km_num: Number.isFinite(Number(spec.km_num)) ? Number(spec.km_num) : null,
    core_km_num: Number.isFinite(Number(spec.core_km_num)) ? Number(spec.core_km_num) : null,
    style: clean(spec.style || spec.road_character),
    level: clean(spec.level),
    start: clean(spec.start) || coreNames[0],
    end: clean(spec.end) || coreNames.at(-1),
    roads: listText(spec.roads),
    return_roads: listText(spec.return_roads),
    best: clean(spec.best),
    summary: clean(spec.summary),
    story_big: clean(spec.story_big) || [clean(spec.summary), ...stops.map((stop) => `${stop.name}: ${stop.story_long}`)].filter(Boolean).join('\n\n'),
    cautions: prose(spec.cautions),
    fuel: prose(spec.fuel),
    stops,
    sources: allSourceUrls,
    seasonal: Boolean(spec.seasonal || status === 'warning'),
    community: false,
    themes: unique(spec.themes || ['נוף וצילום', 'טיול כביש']),
    trip_types: unique(spec.trip_types || ['נוף וצילום', /יום מלא|ארוך/.test(clean(spec.duration)) ? 'יום מלא' : 'טיול קצר']),
    road_profile: {
      fast: Number(profile.fast) || 0,
      twisty: Number(profile.twisty) || 0,
      local: Number(profile.local) || 0,
      urban: Number(profile.urban) || 0,
      gravel: Number(profile.gravel) || 0,
      note: clean(profile.note) || 'החלוקה היא הערכת תכנון מתוך אופי הכבישים המתועד, לא מדידה בזמן אמת.',
      roads: unique(profile.roads || listText(spec.roads).split(',').map((value) => value.trim())),
    },
    food_options: Array.isArray(spec.food_options) ? spec.food_options : [],
    springs: Array.isArray(spec.springs) ? spec.springs : [],
    connections: unique(spec.connections || []),
    checked_on: '09.08.2026 — מקורות, נקודות ניווט ומבנה מפה',
    verification_level: status === 'pass' ? 'מאומת ממקורות' : 'מותנה/עונתי',
    verification_note: status === 'pass'
      ? 'המסלול עבר שער נתונים, מקורות, נקודות ניווט ומפה של גרסה 2.3.0; מצב הדרך נבדק שוב ביום היציאה.'
      : `המסלול מפורסם עם הערה: ${warningReason}`,
    route_shape: pattern === 'loop' ? 'מעגלי' : pattern === 'snake' ? 'לולאת נחש' : pattern === 'out_and_back' ? 'הלוך וחזור' : 'נקודה לנקודה',
    route_pattern: pattern,
    star_direction: starDirection(spec.star_direction || spec.direction, spec.region),
    return_points: returnNames,
    map_points: coreNames,
    full_map_points: fullPoints,
    full_map_coordinates: fullPointObjects.map(pointCoordinates),
    full_map_coordinate_review_states: fullPointObjects.map(pointReviewState),
    navigation_coordinates: navigationCorePoints.map(pointCoordinates),
    return_coordinates: returnPoints.map(pointCoordinates),
    meeting_primary: primaryName,
    meeting_primary_coordinates: pointCoordinates(primary),
    meeting_primary_coordinate_review_state: pointReviewState(primary),
    meeting_secondary: secondaryName,
    meeting_secondary_coordinates: pointCoordinates(secondary),
    meeting_secondary_coordinate_review_state: pointReviewState(secondary),
    meeting_minutes: Number.isFinite(Number(spec.meeting_minutes)) ? Number(spec.meeting_minutes) : undefined,
    full_maps_url: coordinateMapsUrl(fullPoints, fullPointObjects.map(pointCoordinates)),
    core_maps_url: coordinateMapsUrl(coreNames, navigationCorePoints.map(pointCoordinates)),
    research_full_maps_url: httpsUrl(spec.full_maps_url),
    research_core_maps_url: httpsUrl(spec.core_maps_url || spec.maps_url),
    map_leg_urls: urls(spec.map_leg_urls || []),
    quality_checks: [
      { name: 'מפה ורצף נקודות', ok: true },
      { name: 'מקור לכל עצירה', ok: stops.every((stop) => stop.sources.length > 0) },
      { name: 'יציאה מאזור המרכז', ok: insideCentralBand(pointCoordinates(primary)) },
      { name: 'אזהרות ובטיחות', ok: Boolean(clean(spec.cautions)) },
    ],
    quality_score: status === 'pass' ? 100 : null,
    quality_status: status === 'pass' ? 'עבר שער איכות 2.3.0' : 'מפורסם עם הערה — אינו PASS',
    catalogue_version: VERSION,
    research_file: inputName,
    research_ordinal: ordinal + 1,
  };
  return { route, status, severity, warningReason };
}

function validateRecord(record) {
  const { route, status, severity, warningReason } = record;
  const errors = [];
  if (!route.id || !/^[a-z0-9-]+$/i.test(route.id)) errors.push('id אינו תקין');
  for (const field of ['title', 'region', 'area', 'duration', 'km', 'level', 'start', 'end', 'roads', 'best', 'summary', 'cautions', 'fuel']) {
    if (!clean(route[field])) errors.push(`חסר ${field}`);
  }
  if (!Number.isFinite(route.km_num) || route.km_num <= 0) errors.push('km_num חסר או אינו חיובי');
  if (!Number.isFinite(route.meeting_minutes) || route.meeting_minutes <= 0) errors.push('meeting_minutes חסר או אינו חיובי');
  const meetingDistance = haversineKm(route.meeting_primary_coordinates, route.meeting_secondary_coordinates);
  if (Number.isFinite(meetingDistance)) {
    const plausibleMinimum = Math.max(10, meetingDistance / 130 * 60);
    const plausibleMaximum = meetingDistance / 20 * 60 + 45;
    if (route.meeting_minutes < plausibleMinimum || route.meeting_minutes > plausibleMaximum) {
      errors.push(`meeting_minutes ${route.meeting_minutes} אינו סביר למרחק אווירי ${Math.round(meetingDistance)} ק״מ`);
    }
  }
  if (!STATUS_VALUES.has(status)) errors.push(`status לא תקין: ${status}`);
  if (!PATTERN_VALUES.has(route.route_pattern)) errors.push(`route_pattern לא תקין: ${route.route_pattern}`);
  if (status === 'warning' && !SEVERITY_VALUES.has(severity)) errors.push(`severity לא תקין: ${severity}`);
  if (status === 'warning' && warningReason.length < 20) errors.push('חסרה סיבת אזהרה מפורטת');
  if (route.stops.length < 2) errors.push('נדרשות לפחות שתי עצירות');
  // מסלול WARNING רשאי להסתיים בחניה חוקית אחת כאשר שאר תחנות התוכן הן
  // נקודות הליכה מוחרגות (למשל סמטאות עכו העתיקה). אין ליצור יעד ניווט שני
  // מלאכותי רק כדי לעבור את שער הכמות.
  const minimumSafeNavigationPoints = status === 'warning'
    && route.stops.some((stop) => stop.navigation_excluded) ? 1 : 2;
  if (route.map_points.length < minimumSafeNavigationPoints) {
    errors.push(`נדרשות לפחות ${minimumSafeNavigationPoints} נקודות ניווט בטוחות`);
  }
  if (route.sources.length < 1) errors.push('חסר מקור מסלול');
  if (!insideCentralBand(route.meeting_primary_coordinates)) errors.push('נקודת המפגש הראשית אינה מאומתת בין גדרה לתל אביב');
  if (route.full_map_points.length < 3) errors.push('המפה המלאה קצרה מדי');
  if (route.full_map_points.length > 10) errors.push('יותר מ־10 נקודות במפה המלאה; יש לבחור עד 8 נקודות ביניים חד־משמעיות');
  if (route.full_maps_url.length > 2048) errors.push(`קישור המפה המלאה ארוך מדי: ${route.full_maps_url.length} תווים`);
  if (['loop', 'snake', 'out_and_back'].includes(route.route_pattern)
      && route.full_map_points.at(-1) !== route.meeting_primary) {
    errors.push('מסלול הלוך-וחזור/לולאה/נחש אינו חוזר לנקודת המרכז');
  }
  if (['loop', 'snake'].includes(route.route_pattern)) {
    if (!route.return_points.length) errors.push('מסלול לולאה/נחש חסר נקודת חזרה בציר האחר');
    if (!route.return_roads) errors.push('מסלול לולאה/נחש חסר כבישי חזרה');
    const outboundNames = new Set([route.meeting_primary, route.meeting_secondary, ...route.map_points].map(canonicalText));
    if (!route.return_points.some((point) => !outboundNames.has(canonicalText(point)))) {
      errors.push('מסלול לולאה/נחש אינו כולל נקודת חזרה מובחנת מן הציר היוצא');
    }
  }
  if (route.stops.some((stop) => !stop.story_long || !Number.isFinite(stop.minutes) || stop.minutes <= 0)) errors.push('עצירה חסרה סיפור או זמן חיובי');
  if (route.stops.some((stop) => !stop.navigation_excluded && !stop.coordinates)) errors.push('עצירת ניווט בטוחה חסרה קואורדינטות');
  if (route.stops.some((stop) => stop.sources.length === 0)) errors.push('עצירה חסרה מקור ישיר');
  if (route.navigation_coordinates.some((point) => !point)) errors.push('המסלול כולל נקודת ניווט בטוחה לא פתורה');
  if (route.full_map_coordinates.some((point) => !point)) errors.push('המפה המלאה כוללת נקודה ללא קואורדינטות');
  if (route.full_map_coordinate_review_states.some((state) => /pending|unresolved|ambiguous|not_found|failed/.test(state))) {
    errors.push('המפה כוללת התאמת קואורדינטות שלא אושרה ידנית');
  }
  if (status === 'pass' && route.stops.some((stop) => stop.navigation_excluded)) errors.push('מסלול PASS כולל נקודה שהוחרגה מן הניווט');
  if (status === 'warning' && route.stops.some((stop) => stop.navigation_excluded && stop.navigation_exclusion_reason.length < 20)) {
    errors.push('נקודה שהוחרגה מן הניווט חסרה סיבת החרגה מפורטת');
  }
  const profileTotal = ['fast', 'twisty', 'local', 'urban', 'gravel'].reduce((sum, key) => sum + (Number(route.road_profile[key]) || 0), 0);
  if (profileTotal !== 100) errors.push(`פרופיל כביש מסתכם ל־${profileTotal} ולא ל־100`);
  return errors;
}

async function main() {
  const releaseComplete = process.argv.includes('--release');
  const legacyContext = vm.createContext({ window: {} });
  vm.runInContext(await readFile(path.join(ROOT, 'data/legacy-content-v2.js'), 'utf8'), legacyContext, { filename: 'data/legacy-content-v2.js' });
  const legacyRoutes = legacyContext.window.ROAD_BOOK_LEGACY?.routes || [];
  const researchFiles = await Promise.all(INPUTS.map(async (relative) => ({
    relative,
    data: JSON.parse(await readFile(path.join(ROOT, relative), 'utf8')),
  })));
  const records = researchFiles.flatMap(({ relative, data }) => {
    if (data.document_version !== VERSION) throw new Error(`${relative}: גרסת המסמך אינה ${VERSION}`);
    if (!Array.isArray(data.routes)) throw new Error(`${relative}: חסר routes`);
    return data.routes.map((spec, index) => normalizeRoute(spec, relative, index));
  });
  assignGeographicConnections(records);
  const ids = records.map(({ route }) => route.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) throw new Error(`מזהי מסלול כפולים: ${unique(duplicateIds).join(', ')}`);
  const errors = records.flatMap((record) => validateRecord(record).map((error) => `${record.route.id || '?'}: ${error}`));
  const legacyIds = new Set(legacyRoutes.map((route) => route.id));
  const legacyTitles = new Map(legacyRoutes.map((route) => [canonicalText(route.title), route.id]));
  const legacyPointSets = legacyRoutes.map((route) => ({ id: route.id, points: routePointSet(route) }));
  for (const { route } of records) {
    if (legacyIds.has(route.id)) errors.push(`${route.id}: המזהה כבר קיים בקטלוג 2.2.4`);
    const titleMatch = legacyTitles.get(canonicalText(route.title));
    if (titleMatch) errors.push(`${route.id}: הכותרת כפולה למסלול ${titleMatch}`);
    const routePoints = routePointSet(route);
    const duplicate = legacyPointSets.find((legacy) => substantiallyDuplicates(routePoints, legacy.points));
    if (duplicate) errors.push(`${route.id}: חפיפת נקודות גבוהה מדי למסלול ${duplicate.id}`);
  }
  for (let index = 0; index < records.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < records.length; otherIndex += 1) {
      const route = records[index].route;
      const other = records[otherIndex].route;
      if (canonicalText(route.title) === canonicalText(other.title)) errors.push(`${route.id}: כותרת כפולה למסלול החדש ${other.id}`);
      const routePoints = routePointSet(route);
      const otherPoints = routePointSet(other);
      if (substantiallyDuplicates(routePoints, otherPoints) || substantiallyDuplicates(otherPoints, routePoints)) {
        errors.push(`${route.id}: חפיפת נקודות גבוהה מדי למסלול החדש ${other.id}`);
      }
    }
  }
  const passRecords = records.filter((record) => record.status === 'pass');
  const warningRecords = records.filter((record) => record.status === 'warning');
  const loopCount = records.filter((record) => ['loop', 'snake'].includes(record.route.route_pattern)).length;
  if (records.length !== 90) errors.push(`נמצאו ${records.length} מסלולים חדשים במקום 90`);
  if (passRecords.length !== 45) errors.push(`נמצאו ${passRecords.length} מסלולי PASS חדשים במקום 45`);
  if (warningRecords.length !== 45) errors.push(`נמצאו ${warningRecords.length} מסלולי WARNING חדשים במקום 45`);
  if (loopCount < 45) errors.push(`נמצאו רק ${loopCount} מסלולי לולאה/נחש; נדרשים לפחות 45`);
  if (errors.length) throw new Error(`שער בניית ההרחבה נכשל (${errors.length}):\n${errors.join('\n')}`);

  const routes = records.map((record) => record.route);
  const warningSeverity = Object.fromEntries(warningRecords.map((record) => [record.route.id, record.severity]));
  const warningReasons = Object.fromEntries(warningRecords.map((record) => [record.route.id, record.warningReason]));
  const output = `/**\n * הרחבת קטלוג המסלולים — גרסת מסמך ${VERSION}\n * גרסת מוצר: ${VERSION}\n * נבנה אוטומטית משלושה תיקי מחקר; אין לערוך ידנית.\n */\n\n` +
    `window.ROAD_BOOK_V23_EXPANSION = Object.freeze(${JSON.stringify({
      version: VERSION,
      release_complete: releaseComplete,
      routes,
      pass_route_ids: passRecords.map((record) => record.route.id),
      warning_route_ids: warningRecords.map((record) => record.route.id),
      warning_severity: warningSeverity,
      warning_reasons: warningReasons,
    }, null, 2)});\n`;
  await writeFile(path.join(ROOT, OUTPUT), output, 'utf8');
  console.log(JSON.stringify({ routes: records.length, pass: passRecords.length, warning: warningRecords.length, loop_or_snake: loopCount }));
}

export { normalizeRoute, validateRecord, assignGeographicConnections };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
