/**
 * תיקון סמנטי ובטיחותי להרחבת מסלולי הדרום — גרסת מסמך 2.3.0
 * גרסת מוצר: 2.3.0
 *
 * מחליף מסלולים חופפים במסלולי לולאה/נחש היוצאים מן המרכז, ומוציא מן
 * הניווט נקודות סגורות, צבאיות או בעלות גישת עפר שאינה מתאימה לאופנוע כביש.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'reports/research/SOUTH_ROUTE_EXPANSION_2_3_0.json');

const PRIMARY = place('פארק פרס, חולון', 32.0036678, 34.7966276);
const BIG_ASHDOD = place('BIG FASHION אשדוד', 31.7761689, 34.6643774);
const JOE_ALON = place('חניית מרכז ג׳ו אלון', 31.3790549, 34.8653567);
const BEIT_KAMA = place('מחלף בית קמה — נקודת מעבר בלבד', 31.4405576, 34.7723251);
const LEHAVIM = place('מחלף להבים — נקודת מעבר בלבד', 31.3845851, 34.8112424);
const MITZPE_RAMON = place('מצפה רמון', 30.6119687, 34.8012169);
const YERUHAM_RETURN = place('פארק אגם ירוחם — נקודת חזרה', 30.9885959, 34.8955392);
const LATRUN = place('יד לשריון, לטרון', 31.8378181, 34.9796740);

function navigation(lat, lon) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

function place(name, lat, lon, extra = {}) {
  return {
    name,
    navigation: navigation(lat, lon),
    coordinates: { lat, lon },
    review_state: 'manual_confirmed',
    ...extra,
  };
}

function point(name, lat, lon, kind, minutes, story, era, sources, extra = {}) {
  return place(name, lat, lon, {
    kind,
    minutes,
    story,
    story_long: story,
    era,
    sources,
    ...extra,
  });
}

function excludedPoint(name, lat, lon, kind, story, era, sources, reason) {
  return point(name, lat, lon, kind, 10, story, era, sources, {
    navigation_excluded: true,
    navigation_exclusion_reason: reason,
  });
}

function mapsUrl(points) {
  const coords = points.map((item) => `${item.coordinates.lat},${item.coordinates.lon}`);
  const params = new URLSearchParams({
    api: '1',
    origin: coords[0],
    destination: coords.at(-1),
    travelmode: 'driving',
  });
  if (coords.length > 2) params.set('waypoints', coords.slice(1, -1).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function route({
  id,
  title,
  area,
  status,
  severity = null,
  warningReason = null,
  pattern,
  direction,
  secondary,
  meetingMinutes,
  level,
  roadCharacter,
  roads,
  returnRoads,
  best,
  summary,
  cautions,
  fuel,
  duration,
  km,
  hours,
  corePoints,
  returnPoints,
}) {
  const safeCore = corePoints.filter((item) => !item.navigation_excluded);
  const mapPoints = [PRIMARY, secondary, ...safeCore, ...returnPoints, PRIMARY]
    .filter((item, index, all) => index === 0 || item.name !== all[index - 1].name);
  const sources = [...new Set(corePoints.flatMap((item) => item.sources || []))];
  return {
    id,
    title,
    region: 'דרום',
    area,
    status,
    severity,
    warning_reason: warningReason,
    route_pattern: pattern,
    direction,
    primary: structuredClone(PRIMARY),
    secondary: structuredClone(secondary),
    level,
    road_character: roadCharacter,
    roads,
    best,
    summary,
    cautions,
    fuel,
    start: PRIMARY.name,
    end: PRIMARY.name,
    meeting_minutes: meetingMinutes,
    duration: `${duration} (${hours.toFixed(1)} שעות רכיבה נטו לפני עצירות)`,
    km: `כ־${km} ק״מ מאזור המרכז ובחזרה`,
    km_num: km,
    estimated_km: km,
    estimated_driving_hours: hours,
    core_points: corePoints,
    return_points: returnPoints.map((item) => structuredClone(item)),
    return_roads: returnRoads,
    full_maps_url: mapsUrl(mapPoints),
    sources,
  };
}

const pass003 = route({
  id: 'south-expansion-pass-003',
  title: 'באר שבע של סקרנות ותרבות: לונדע, קרסו והאסלאם',
  area: 'באר שבע',
  status: 'PASS',
  pattern: 'loop',
  direction: 'דרום',
  secondary: BIG_ASHDOD,
  meetingMinutes: 28,
  level: 'קל',
  roadCharacter: 'ציר בין־עירוני אל באר שבע ומקטע עירוני קצר בין שלושה מוסדות ביקור; חזרה בציר 40–6.',
  roads: ['4', '41', '40', '6', '1'],
  returnRoads: ['40', '6', '1'],
  best: 'כל השנה; יש להזמין ולבדוק שעות בכל מוסד לפני היציאה.',
  summary: 'לולאה עירונית־תרבותית שמחברת מדע אינטראקטיבי, מדע היסטורי ואמנות מן המזרח התיכון בלי לחזור על אתרי נתיב אנז״ק.',
  cautions: ['המעבר בין האתרים עירוני וכולל עומסי תנועה ורמזורים.', 'לונדע ופארק קרסו דורשים בדיקת שעות וכרטיסים מראש.'],
  fuel: 'מכל מלא באזור אשדוד; תדלוק גיבוי בבאר שבע לפני החזרה.',
  duration: 'יום מלא',
  km: 220,
  hours: 3.1,
  corePoints: [
    point('לונדע — מוזאון הילדים של באר שבע', 31.2625372, 34.7632395, 'מוזאון אינטראקטיבי', 90, 'מרחב התנסות אינטראקטיבי שמאפשר לדבר על למידה דרך תנועה, משחק וסקרנות.', 'מדע וחינוך עכשוויים', ['https://lunada.co.il/']),
    point('פארק קרסו למדע', 31.2418329, 34.7859019, 'מוזאון מדע', 90, 'מתחם מדע בבניינים היסטוריים של העיר העתיקה, עם תערוכות המדגימות עקרונות מדעיים.', 'עות׳מאני עד עכשווי', ['https://sci-park.co.il/%D7%A9%D7%A2%D7%95%D7%AA-%D7%A4%D7%A2%D7%99%D7%9C%D7%95%D7%AA/']),
    point('המוזאון לתרבות האסלאם ועמי המזרח', 31.2414910, 34.7886810, 'מוזאון אמנות ותרבות', 60, 'המוזאון שוכן במסגד הגדול ההיסטורי ומציג אמנות ותרבות של עמי האסלאם והמזרח.', 'עות׳מאני עד עכשווי', ['https://ine-museum.org.il/']),
  ],
  returnPoints: [LEHAVIM],
});

const pass004 = route({
  id: 'south-expansion-pass-004',
  title: 'בעלי חיים ומים במדבר: מדבריום–דימונה–ירוחם',
  area: 'באר שבע–דימונה–ירוחם',
  status: 'PASS',
  pattern: 'snake',
  direction: 'דרום-מזרח',
  secondary: JOE_ALON,
  meetingMinutes: 68,
  level: 'בינוני',
  roadCharacter: 'מסלול נחש סלול: ירידה דרך כביש 6 לבאר שבע, המשך מזרחה לדימונה וירוחם וחזרה בציר 40.',
  roads: ['6', '40', '25', '204', '224', '40', '6', '1'],
  returnRoads: ['224', '40', '6', '1'],
  best: 'סתיו עד אביב; בקיץ רק בשעות קרירות ובהתאם לשעות האתרים.',
  summary: 'יום דרומי מגוון שמתחיל בחיות מדבר, ממשיך לאגם דימונה ומסיים באגם ירוחם לפני חזרה בציר אחר.',
  cautions: ['רוחות צד וחול אפשריים בכבישים 204 ו־224.', 'יש לבדוק מראש את שעות מדבריום ואת מצב הפארקים העירוניים.'],
  fuel: 'תדלוק בבאר שבע; גיבוי בדימונה לפני ירוחם.',
  duration: 'יום מלא',
  km: 313,
  hours: 4.8,
  corePoints: [
    point('מדבריום — פארק החיות באר שבע', 31.2608801, 34.7464693, 'פארק בעלי חיים', 120, 'פארק חווייתי העוסק בהתאמות של בעלי חיים ובתי גידול לסביבה המדברית.', 'טבע וחינוך עכשוויים', ['https://midbarium.co.il/%D7%A6%D7%A8%D7%95-%D7%A7%D7%A9%D7%A8/']),
    point('אגם דימונה', 31.0811485, 35.0313155, 'אגם ופארק עירוני', 35, 'אגם מלאכותי ופארק עירוני המדגימים יצירת מרחב פנאי בלב אקלים צחיח.', 'פיתוח עירוני מודרני', ['https://www.dimona.muni.il/%D7%90%D7%92%D7%9D-%D7%93%D7%99%D7%9E%D7%95%D7%A0%D7%94/']),
    point('פארק אגם ירוחם', 30.9885959, 34.8955392, 'פארק ואגם', 45, 'מאגר מים ופארק קהילתי המשמשים תחנת טבע ומנוחה לפני החזרה צפונה.', 'פיתוח מדברי מודרני', ['https://visit-yerucham.com/tour-item-travel/%D7%A4%D7%90%D7%A8%D7%A7-%D7%90%D7%92%D7%9D-%D7%99%D7%A8%D7%95%D7%97%D7%9D/', 'https://www.kkl.org.il/travel/trips/42/']),
  ],
  returnPoints: [BEIT_KAMA],
});

const pass013 = route({
  id: 'south-expansion-pass-013',
  title: 'אילת הבוטנית והימית: גן, דולפינים ומצפה תת־ימי',
  area: 'אילת והערבה הדרומית',
  status: 'PASS',
  pattern: 'snake',
  direction: 'דרום',
  secondary: JOE_ALON,
  meetingMinutes: 68,
  level: 'ארוך — יומיים',
  roadCharacter: 'מסלול נחש ארוך על כבישי 40 ו־90 דרומה, ובחזרה דרך כביש 12 ומצפה רמון; כולו סלול.',
  roads: ['6', '40', '90', '12', '40', '6', '1'],
  returnRoads: ['12', '40', '6', '1'],
  best: 'אוקטובר עד אפריל; להזמין מראש ולחלק ליומיים.',
  summary: 'מסלול אילתי עצמאי המשלב צמחי מדבר, מפגש ימי ותצפית תת־ימית, עם ציר חזרה שונה דרך מצפה רמון.',
  cautions: ['המסלול דורש לינה ותכנון טווח דלק.', 'אין לבצע בשרב, בשיטפון או בעייפות; בודקים שעות וכרטיסים מראש.'],
  fuel: 'תדלוק בבאר שבע, בערבה ובאילת; בחזרה משלימים במצפה רמון.',
  duration: 'יומיים',
  km: 684,
  hours: 9.7,
  corePoints: [
    point('הגן הבוטני של אילת', 29.5739016, 34.9638671, 'גן בוטני', 75, 'גן המציג צמחייה המתאימה לאקלים המדברי ומרחב ירוק שנבנה בתנאי קיצון.', 'טבע ופיתוח עכשוויים', ['https://www.botanicgarden.co.il/gan-botani']),
    point('ריף הדולפינים', 29.5260651, 34.9370469, 'אתר טבע ימי', 120, 'אתר בחוף ים סוף המאפשר היכרות מבוקרת עם דולפינים וסביבתם הימית.', 'טבע ימי עכשווי', ['https://www.dolphinreef.co.il/experience-thereef']),
    point('פארק המצפה התת־ימי', 29.5040726, 34.9192423, 'מרכז מבקרים ימי', 120, 'חלונות תצפית אל שונית ים סוף ותצוגות הממחישות את המערכת האקולוגית הימית.', 'טבע ימי וחינוך', ['https://coralworld.co.il/']),
  ],
  returnPoints: [MITZPE_RAMON, BEIT_KAMA],
});

const warning002 = route({
  id: 'south-expansion-warning-002',
  title: 'פורה ושוקדה: פריחה, יער וכניסה מדויקת',
  area: 'צפון הנגב ומערב הנגב',
  status: 'WARNING',
  severity: 'minor_navigation',
  warningReason: 'בשמורת פורה וביער שוקדה קיימות דרכי שירות ודרכי עפר סמוכות; הניווט מיועד לחניות הכניסה בלבד, ויש לעצור אם האספלט מסתיים או השילוט אינו תואם.',
  pattern: 'loop',
  direction: 'דרום-מערב',
  secondary: BIG_ASHDOD,
  meetingMinutes: 28,
  level: 'קל–בינוני',
  roadCharacter: 'כבישים אזוריים סלולים בין שני מוקדי פריחה; הסטייה מן הכביש מוגבלת לחניה חוקית ומסומנת.',
  roads: ['4', '35', '40', '293', '232', '34', '40', '6', '1'],
  returnRoads: ['34', '40', '6', '1'],
  best: 'חורף ואביב בעונת הפריחה, לאחר בדיקת הודעות פתיחה.',
  summary: 'לולאה מערבית חדשה בין שמורת פורה ליער שוקדה, עם אזהרת ניווט מקומית שאינה מבטלת את יום הרכיבה.',
  cautions: ['אין להמשיך לדרך עפר אם החניה או דרך הגישה אינן מתאימות לאופנוע כביש.', 'בעונת פריחה צפויים עומס הולכי רגל וכלי רכב סמוך לכניסות.'],
  fuel: 'תדלוק באשדוד או בקריית גת; גיבוי באזור נתיבות.',
  duration: 'יום חלקי',
  km: 232,
  hours: 3.8,
  corePoints: [
    point('שמורת טבע פורה — חניית כניסה', 31.4966619, 34.7752658, 'שמורת טבע', 50, 'שמורה עונתית של בתרונות, פריחה וערוץ נחל פורה; הביקור מתחיל רק מן החניה המסומנת.', 'טבע עונתי', ['https://www.parks.org.il/reserve-park/fura/']),
    point('יער שוקדה — חניית כניסה', 31.4262613, 34.5124323, 'יער ופריחה', 45, 'יער קק״ל המוכר במרבדי כלניות; נשארים בחניה ובדרכים המותרות לפי השילוט בשטח.', 'יער קק״ל מודרני', ['https://www.kkl.org.il/travel/trips/shokeda_forest/']),
  ],
  returnPoints: [BEIT_KAMA],
});

const warning003 = route({
  id: 'south-expansion-warning-003',
  title: 'אירוס ירוחם ובית המייסדים: שתי כניסות שיש לזהות',
  area: 'ירוחם',
  status: 'WARNING',
  severity: 'minor_navigation',
  warningReason: 'נקודת הכניסה לשמורת אירוס ירוחם עונתית ואינה זהה לבית המייסדים העירוני; יש להשתמש בכל נקודה בנפרד, לאמת שילוט ולא להמשיך לשביל עפר לא מתאים.',
  pattern: 'loop',
  direction: 'דרום',
  secondary: JOE_ALON,
  meetingMinutes: 68,
  level: 'בינוני',
  roadCharacter: 'כבישי 40 ו־204 הסלולים אל ירוחם, עם ניווט עירוני קצר וחניה נפרדת לשמורת האירוסים.',
  roads: ['6', '40', '204', '224', '40', '6', '1'],
  returnRoads: ['224', '40', '6', '1'],
  best: 'בעונת פריחת האירוס ובהתאם להודעות רט״ג; בית המייסדים בתיאום שעות.',
  summary: 'יום ירוחמי המחבר טבע עונתי עם סיפור הקמת העיירה ואגם ירוחם, תוך הפרדה ברורה בין נקודות הניווט.',
  cautions: ['אין לרכוב בתוך השמורה ואין להסתמך על שם חיפוש כללי.', 'בודקים שעות פעילות של בית המייסדים לפני היציאה.'],
  fuel: 'תדלוק בבאר שבע או בירוחם; חזרה דרך כביש 224.',
  duration: 'יום מלא',
  km: 292,
  hours: 4.7,
  corePoints: [
    point('שמורת טבע אירוס ירוחם — חניית כניסה', 31.0210312, 34.9741410, 'שמורת טבע עונתית', 45, 'שמורה המגינה על אירוס ירוחם ועל בית הגידול המדברי שלו; הביקור רגלי מן החניה המותרת.', 'טבע עונתי', ['https://www.parks.org.il/reserve-park/%D7%A9%D7%9E%D7%95%D7%A8%D7%AA-%D7%98%D7%91%D7%A2-%D7%90%D7%99%D7%A8%D7%95%D7%A1-%D7%99%D7%A8%D7%95%D7%97%D7%9D/']),
    point('בית המייסדים ופארק מורשת ירוחם', 30.9875043, 34.9232727, 'מרכז מורשת ומידע', 60, 'מרכז המבקרים מספר את תולדות ירוחם וקהילותיה ומשמש נקודת מוצא לסיורים בעיר.', 'שנות ה־50 עד ימינו', ['https://visit-yerucham.com/tour-item-attraction/%D7%A2%D7%AA%D7%99%D7%93-%D7%91%D7%9E%D7%93%D7%91%D7%A8-2/']),
    point('פארק אגם ירוחם', 30.9885959, 34.8955392, 'פארק ואגם', 40, 'תחנת סיום פתוחה יחסית לצד המאגר והפארק לפני ציר החזרה השונה צפונה.', 'פיתוח מדברי מודרני', ['https://visit-yerucham.com/tour-item-travel/%D7%A4%D7%90%D7%A8%D7%A7-%D7%90%D7%92%D7%9D-%D7%99%D7%A8%D7%95%D7%97%D7%9D/']),
  ],
  returnPoints: [BEIT_KAMA],
});

const warning007 = route({
  id: 'south-expansion-warning-007',
  title: 'לקיה וּואדי עתיר: תרבות בדואית וקיימות בתיאום',
  area: 'צפון הנגב',
  status: 'WARNING',
  severity: 'conditional',
  warningReason: 'שני מרכזי התוכן מקבלים מבקרים ופעילויות לפי תיאום ולא כתחנת מעבר חופשית; אין להגיע עם קבוצה ללא אישור מפורש ושעת מפגש.',
  pattern: 'loop',
  direction: 'דרום-מזרח',
  secondary: JOE_ALON,
  meetingMinutes: 68,
  level: 'קל–בינוני',
  roadCharacter: 'כבישי צפון הנגב הסלולים בין להב, לקיה ומיזם ואדי עתיר; חזרה דרך להבים.',
  roads: ['6', '31', '358', '60', '31', '6', '1'],
  returnRoads: ['60', '31', '6', '1'],
  best: 'כל השנה במזג אוויר נוח ורק לאחר תיאום כתוב עם שני האתרים.',
  summary: 'לולאה חברתית־מדברית שמחברת מלאכת רקמה מקומית עם חקלאות וקיימות בדואית יישומית.',
  cautions: ['אין להיכנס למתחם פרטי ללא אישור.', 'כבישים מקומיים כוללים תנועה חקלאית וצמתים צפופים.'],
  fuel: 'מכל מלא ביציאה; גיבוי בלהבים או באר שבע.',
  duration: 'יום מלא',
  km: 222,
  hours: 3.1,
  corePoints: [
    point('רקמת המדבר, לקיה', 31.3216990, 34.8590520, 'מרכז מבקרים ומלאכה', 75, 'יוזמה מקומית המציגה רקמה בדואית, עבודת נשים ומסורת חומרית של הקהילה.', 'מסורת בדואית ועשייה עכשווית', ['https://laqye.muni.il/he/157/']),
    point('פרויקט ואדי עתיר', 31.2722222, 34.9380556, 'מרכז קיימות וחקלאות', 90, 'מיזם קהילתי המשלב חקלאות מדברית, אנרגיה, מים וידע בדואי מסורתי.', 'קיימות עכשווית', ['https://projectwadiattir.com/']),
  ],
  returnPoints: [LEHAVIM],
});

const warning008 = route({
  id: 'south-expansion-warning-008',
  title: 'מצפה רמון מבפנים: אלפקות ורובע דרכי הבשמים',
  area: 'מצפה רמון',
  status: 'WARNING',
  severity: 'conditional',
  warningReason: 'הביקור בחוות האלפקות ובפעילויות ברובע דרכי הבשמים תלוי בשעות פתיחה ובהזמנה; אין לבנות יום קבוצתי על הגעה ספונטנית.',
  pattern: 'loop',
  direction: 'דרום',
  secondary: JOE_ALON,
  meetingMinutes: 68,
  level: 'בינוני',
  roadCharacter: 'כביש 40 הסלול למצפה רמון, מעבר מקומי קצר וחזרה דרך ירוחם וכביש 224.',
  roads: ['6', '40', '204', '224', '40', '6', '1'],
  returnRoads: ['204', '224', '40', '6', '1'],
  best: 'סתיו עד אביב, לאחר אישור שעות ופעילות בשני האתרים.',
  summary: 'לולאה אל מצפה רמון שמתרכזת בעסקים וביוזמות מקומיות ולא חוזרת על מרכז המבקרים או עבדת.',
  cautions: ['יש לתאם מראש את חוות האלפקות ואת הפעילות ברובע.', 'בכביש 40 צפויים רוחות, ערפל מקומי ועייפות בחזרה.'],
  fuel: 'תדלוק בבאר שבע או במצפה רמון; גיבוי בירוחם בחזרה.',
  duration: 'יום מלא',
  km: 386,
  hours: 5.7,
  corePoints: [
    point('חוות האלפקות, מצפה רמון', 30.6107795, 34.7767741, 'חווה תיירותית', 90, 'חווה המתמקדת באלפקות ולאמות ומציעה ביקור מודרך בהתאם לשעות ולהזמנה.', 'חקלאות ותיירות עכשווית', ['https://alpaca.co.il/visit/']),
    point('רובע דרכי הבשמים, מצפה רמון', 30.6215360, 34.8008060, 'רובע יצירה ותיירות', 75, 'מתחם של סדנאות, יוצרים ועסקים מקומיים במבני התעשייה הוותיקים של מצפה רמון.', 'פיתוח מקומי עכשווי', ['https://www.noamshalev.co.il/']),
  ],
  returnPoints: [YERUHAM_RETURN, BEIT_KAMA],
});

const warning009 = route({
  id: 'south-expansion-warning-009',
  title: 'חוות ויקבים בהר הנגב: נחל בוקר–כרמי עבדת–ננה',
  area: 'הר הנגב',
  status: 'WARNING',
  severity: 'conditional',
  warningReason: 'שלושת האתרים הם עסקים פרטיים הפועלים לפי הזמנה ושעות משתנות; טעימות אלכוהול אינן מתאימות למי שממשיך לרכוב.',
  pattern: 'snake',
  direction: 'דרום',
  secondary: JOE_ALON,
  meetingMinutes: 68,
  level: 'בינוני–ארוך',
  roadCharacter: 'ציר 40 הסלול בין חוות הר הנגב, עם חזרה דרך מצפה רמון, ירוחם וכביש 224.',
  roads: ['6', '40', '204', '224', '40', '6', '1'],
  returnRoads: ['204', '224', '40', '6', '1'],
  best: 'סתיו עד אביב, בתיאום מלא וללא צריכת אלכוהול לרוכבים.',
  summary: 'מסלול נחש שעוסק בחקלאות תיירותית בהר הנגב ומציג שלושה עסקים שונים לאורך ציר 40.',
  cautions: ['הרוכבים אינם טועמים אלכוהול לפני המשך רכיבה.', 'אין להיכנס לדרך חווה שאינה מסומנת או שאינה מאושרת בתיאום.'],
  fuel: 'תדלוק בבאר שבע ובמצפה רמון; השלמה בירוחם בחזרה.',
  duration: 'יום מלא',
  km: 392,
  hours: 6.8,
  corePoints: [
    point('חוות נחל בוקר', 30.9063390, 34.7764406, 'חווה ואירוח', 60, 'חוות בודדים בהר הנגב המשלבת חקלאות, אירוח וסיפור התיישבות מדברית.', 'התיישבות חקלאית עכשווית', ['https://www.bokerfarm.com/about']),
    point('כרמי עבדת', 30.8271673, 34.7433818, 'חווה וכרם', 60, 'חווה המתמחה בגידול כרם ויין בתנאי המדבר וממחישה חידוש חקלאות קדומה.', 'חקלאות מדברית עכשווית', ['https://carmey-avdat.co.il/']),
    point('יקב ננה, מצפה רמון', 30.6144559, 34.7526219, 'כרם ויקב', 60, 'יקב מדברי באזור מצפה רמון; הביקור עוסק בכרם ובייצור בלבד לרוכבים שממשיכים בדרך.', 'חקלאות ויין עכשוויים', ['https://nanawine.com/']),
  ],
  returnPoints: [YERUHAM_RETURN, BEIT_KAMA],
});

const warning010 = route({
  id: 'south-expansion-warning-010',
  title: 'קטורה ואליפז: סביבה וחקלאות בערבה הדרומית',
  area: 'הערבה הדרומית',
  status: 'WARNING',
  severity: 'conditional',
  warningReason: 'מכון הערבה וחממת חמשת החושים אינם תחנות חופשיות לקבוצה; נדרש תיאום מוקדם ואישור פעילות בכל אתר.',
  pattern: 'snake',
  direction: 'דרום',
  secondary: JOE_ALON,
  meetingMinutes: 68,
  level: 'ארוך — יומיים',
  roadCharacter: 'ירידה סלולה בכבישי 40 ו־90 לקטורה ולאליפז וחזרה בציר 12–40 דרך מצפה רמון.',
  roads: ['6', '40', '90', '12', '40', '6', '1'],
  returnRoads: ['12', '40', '6', '1'],
  best: 'אוקטובר עד אפריל, ביומיים ורק לאחר תיאום שני הביקורים.',
  summary: 'מסלול נחש לימודי שמחבר מחקר סביבתי אזורי עם חקלאות חווייתית בערבה הדרומית.',
  cautions: ['אין להגיע ללא תיאום כתוב.', 'נדרשים לינה, בדיקת מזג אוויר וטווחי דלק ארוכים.'],
  fuel: 'תדלוק בבאר שבע, ביטבתה או באזור אילת; חזרה דרך מצפה רמון.',
  duration: 'יומיים',
  km: 620,
  hours: 8.7,
  corePoints: [
    point('מכון הערבה ללימודי הסביבה, קטורה', 29.9685365, 35.0593387, 'מכון מחקר וחינוך', 90, 'מכון אקדמי־סביבתי העוסק בשיתוף פעולה אזורי, מים, אנרגיה ומדבר.', 'מחקר וחינוך עכשוויים', ['https://arava.org/%D7%A2%D7%91%D7%A8%D7%99%D7%AA-home/']),
    point('חממת חמשת החושים, אליפז', 29.7955166, 35.0144792, 'מרכז חקלאות חווייתית', 75, 'חממה חקלאית המדגימה גידולים, טעמים וטכנולוגיות חקלאות בתנאי הערבה.', 'חקלאות מדברית עכשווית', ['https://www.aravadesert.co.il/business/37/']),
  ],
  returnPoints: [MITZPE_RAMON, BEIT_KAMA],
});

const warning011 = route({
  id: 'south-expansion-warning-011',
  title: 'יער פלוגות וקוממיות סגורים — חלופת תום ותומר וגברעם',
  area: 'שפלת הדרום ומערב הנגב',
  status: 'WARNING',
  severity: 'major',
  warningReason: 'יער פלוגות ושביל הכפר ביער קוממיות סגורים לפי הודעות קק״ל העדכניות; שתי הנקודות נשמרות לתיעוד בלבד ומוחרגות לחלוטין מן המפה הבטוחה.',
  pattern: 'loop',
  direction: 'דרום-מערב',
  secondary: BIG_ASHDOD,
  meetingMinutes: 28,
  level: 'בינוני — בגרסה הבטוחה בלבד',
  roadCharacter: 'לולאה סלולה אל אתרי ההנצחה תום ותומר וגברעם; היערות הסגורים אינם כלולים בניווט.',
  roads: ['4', '3', '232', '34', '35', '38', '1'],
  returnRoads: ['35', '38', '1'],
  best: 'רק בגרסה הבטוחה ולאחר בדיקת הודעות קק״ל ופיקוד העורף ביום היציאה.',
  summary: 'שתי סגירות מהותיות מוצגות בגלוי, אך המסלול המעשי נשאר יום הנצחה סלול בין תום ותומר לגברעם.',
  cautions: ['אין לנווט או להיכנס ליער פלוגות ולשביל הכפר ביער קוממיות.', 'אם הוראות הביטחון משתנות, מבטלים או מקצרים את המסלול.'],
  fuel: 'תדלוק באשדוד או אשקלון; גיבוי בקריית גת לפני החזרה.',
  duration: 'יום חלקי',
  km: 153,
  hours: 3.4,
  corePoints: [
    excludedPoint('יער פלוגות — סגור, תיעוד בלבד', 31.6179321, 34.7458799, 'יער סגור', 'קק״ל פרסמה שהיער סגור לציבור; הנקודה נשמרת כדי להסביר מדוע אינה מופיעה בניווט.', 'יער קק״ל', ['https://www.kkl.org.il/recreation-and-tours/messages/'], 'היער סגור לציבור לפי הודעת קק״ל עד הודעה חדשה; אסור לכלול אותו בניווט או לעקוף מחסום.'),
    excludedPoint('יער קוממיות — שביל הכפר סגור, תיעוד בלבד', 31.6298584, 34.7505463, 'יער ושביל סגורים', 'שביל הכפר ואתר המחצבה ביער קוממיות מתועדים כחסם בלבד ואינם יעד רכיבה.', 'יער קק״ל', ['https://www.kkl.org.il/recreation-and-tours/messages/'], 'שביל הכפר סגור ואתר המחצבה אסור לכניסה לפי הודעת קק״ל; הנקודה מוחרגת מן המפה הבטוחה.'),
    point('מצפה תום ותומר', 31.6699580, 34.6763421, 'גן הנצחה ותצפית', 50, 'גן הנצחה לזכר 73 חללי אסון המסוקים, עם תצפית ושבילי ביקור מן החניה.', '1997 והלאה', ['https://tom-tomer.org.il/']),
    point('אנדרטת חללי צוק איתן, יער גברעם', 31.5866183, 34.6245453, 'אתר הנצחה', 40, 'אתר הנצחה קהילתי ביער גברעם לחללי מבצע צוק איתן, הנגיש מן הציר המקומי.', '2014 והלאה', ['https://www.kkl.org.il/about-us/news-archive/news-archive-2021/tzuk-eitan-memeorial-yaar-gvaram.aspx']),
  ],
  returnPoints: [LATRUN],
});

const warning012 = route({
  id: 'south-expansion-warning-012',
  title: 'נתיב אנז״ק הבטוח: יד מרדכי לבאר שבע, בלי יד אנז״ק',
  area: 'מישור החוף הדרומי ובאר שבע',
  status: 'WARNING',
  severity: 'major',
  warningReason: 'יד אנז״ק ביער בארי סגור למבקרים; הוא נשמר כתיעוד בלבד ומוחרג מן הניווט. הגרסה הבטוחה ממשיכה מיד מרדכי לאתרי אנז״ק העירוניים בבאר שבע.',
  pattern: 'snake',
  direction: 'דרום-מערב ואז דרום-מזרח',
  secondary: BIG_ASHDOD,
  meetingMinutes: 28,
  level: 'בינוני — בגרסה הבטוחה בלבד',
  roadCharacter: 'מסלול נחש סלול לאורך החוף ליד מרדכי, משם לבאר שבע וחזרה דרך כביש 40–6.',
  roads: ['4', '34', '25', '40', '6', '1'],
  returnRoads: ['40', '6', '1'],
  best: 'כל השנה במזג אוויר נוח, עם תיאום המוזאונים ובדיקת הנחיות ביטחון.',
  summary: 'סיפור אנז״ק נשמר בלי לשלוח רוכבים לאתר הסגור: יד מרדכי משמשת תחנת מורשת, ובאר שבע משלימה את פרק מלחמת העולם הראשונה.',
  cautions: ['אין להתקרב ליד אנז״ק או ליער בארי כל עוד אין פתיחה מפורשת.', 'מוזאון יד מרדכי ומרכז אנז״ק פועלים בשעות מוגבלות ובתיאום.'],
  fuel: 'תדלוק באשדוד, אשקלון או באר שבע; אין להסתמך על שירותים ליד האתר הסגור.',
  duration: 'יום מלא',
  km: 208,
  hours: 3.0,
  corePoints: [
    excludedPoint('יד אנז״ק — סגור, תיעוד בלבד', 31.4485692, 34.4618819, 'אנדרטה סגורה', 'האנדרטה ביער בארי מייצגת תחנה מרכזית בנתיב ההיסטורי, אך אינה יעד מותר כעת.', 'מלחמת העולם הראשונה', ['https://www.kkl.org.il/travel/trips/anzac-trail/'], 'קק״ל מציינת במפורש שיד אנז״ק סגור למבקרים; הנקודה אינה נכללת בשום קישור ניווט בטוח.'),
    point('מוזאון יד מרדכי — משואה לתקומה', 31.5900465, 34.5572912, 'מוזאון מורשת', 75, 'המוזאון מחבר בין מרד גטו ורשה, הקמת הקיבוץ וקרב יד מרדכי במלחמת העצמאות.', 'השואה ומלחמת העצמאות', ['https://ymmuseum.org/info/']),
    point('פארק החייל האוסטרלי, באר שבע', 31.2598654, 34.7732677, 'פארק הנצחה', 35, 'פארק ציבורי ובו פסל פרש אוסטרלי המנציח את פרשי אנז״ק ואת כיבוש באר שבע.', 'מלחמת העולם הראשונה', ['https://www.kkl.org.il/travel/trips/anzac-trail/']),
    point('המרכז להנצחת חיילי אנז״ק, באר שבע', 31.2436043, 34.7826800, 'מרכז מורשת', 75, 'מרכז חווייתי המספר את מסע פרשי אנז״ק ואת קרב באר שבע, בסמוך לבית הקברות הבריטי.', 'מלחמת העולם הראשונה', ['https://anzac.co.il/']),
  ],
  returnPoints: [BEIT_KAMA],
});

const warning013 = route({
  id: 'south-expansion-warning-013',
  title: 'בארות יצחק ויער אסף שמחוני סגורים — חלופת שקמה',
  area: 'מערב הנגב ושער הנגב',
  status: 'WARNING',
  severity: 'major',
  warningReason: 'בארות יצחק הישנה נמצאת בשטח צבאי סגור ויער אסף שמחוני סגור לפי הודעת קק״ל; שתיהן נשמרות כתיעוד בלבד ומוחרגות מן הניווט.',
  pattern: 'loop',
  direction: 'דרום-מערב',
  secondary: BIG_ASHDOD,
  meetingMinutes: 28,
  level: 'קל–בינוני — בגרסה הבטוחה בלבד',
  roadCharacter: 'לולאה סלולה למוזאון יד מרדכי ולגבעת הכלניות; שתי הנקודות הסגורות אינן במפה.',
  roads: ['4', '34', '334', '40', '6', '1'],
  returnRoads: ['334', '40', '6', '1'],
  best: 'חורף ואביב, אחרי בדיקת הנחיות ביטחון ותיאום מוזאון יד מרדכי.',
  summary: 'הגרסה הבטוחה מחברת את מורשת יד מרדכי לגבעת הכלניות, ומציגה בגלוי שתי נקודות מורשת שאסורות לכניסה.',
  cautions: ['אין להתקרב לבארות יצחק הישנה או ליער אסף שמחוני ואין לעקוף מחסום.', 'בגבעת הכלניות חונים רק במקום המותר ואינם נכנסים לחוות שקמים.'],
  fuel: 'תדלוק באשדוד או אשקלון; גיבוי באזור שדרות לפני החזרה.',
  duration: 'יום חלקי',
  km: 172,
  hours: 3.0,
  corePoints: [
    excludedPoint('בארות יצחק הישנה — שטח צבאי סגור, תיעוד בלבד', 31.4608612, 34.5003395, 'אתר מורשת סגור', 'מגדל המים ושרידי הקיבוץ הישן מתעדים את קרבות 1948, אך האתר אינו פתוח לביקור.', 'מלחמת העצמאות', ['https://www.kkl.org.il/travel/beerot_yitzhak/'], 'האתר מוגדר שטח צבאי סגור עקב הלחימה; הוא מוחרג לחלוטין מן הניווט ואין להתקרב אליו.'),
    excludedPoint('יער אסף שמחוני — סגור, תיעוד בלבד', 31.4754755, 34.5229631, 'יער סגור', 'היער ואתריו נשמרים ברשומה כדי להסביר את החסם העדכני ולא כדי להציע כניסה.', 'הנצחה ופיתוח נוף', ['https://www.kkl.org.il/recreation-and-tours/messages/'], 'קק״ל מפרסמת שהיער סגור לציבור עד הודעה חדשה; הנקודה אינה חלק מן המפה הבטוחה.'),
    point('מוזאון יד מרדכי — משואה לתקומה', 31.5900465, 34.5572912, 'מוזאון מורשת', 75, 'מוזאון הקיבוץ עוסק בשואה, בתקומה ובקרב יד מרדכי, בתיאום שעות ביקור.', 'השואה ומלחמת העצמאות', ['https://ymmuseum.org/info/']),
    point('גבעת הכלניות — קברי אריאל ולילי שרון', 31.5074000, 34.6274000, 'אתר הנצחה ותצפית', 40, 'הגבעה צופה אל חוות שקמים ובה קבריהם של אריאל ולילי שרון; מגיעים רק לחניה הציבורית.', 'היסטוריה ישראלית עכשווית', ['https://www.kkl.org.il/travel/trips/2904/']),
  ],
  returnPoints: [BEIT_KAMA],
});

const warning014 = route({
  id: 'south-expansion-warning-014',
  title: 'ממשית וצפון הערבה — בלי חציית מעלה עקרבים החסום',
  area: 'דימונה וצפון הערבה',
  status: 'WARNING',
  severity: 'major',
  warningReason: 'הקטע העליון של כביש 227 ומעלה עקרבים חסום; נקודת החסם נשמרת להסבר ומוחרגת מן הניווט. המסלול הבטוח מגיע לצפון הערבה בכבישים 25 ו־90 וחוזר דרך מצפה רמון.',
  pattern: 'snake',
  direction: 'דרום-מזרח',
  secondary: JOE_ALON,
  meetingMinutes: 68,
  level: 'ארוך — ללא המעלה החסום',
  roadCharacter: 'מסלול נחש סלול דרך דימונה וצומת הערבה, עם חזרה בכביש 90–40; כביש 227 העליון אינו כלול.',
  roads: ['6', '25', '90', '40', '6', '1'],
  returnRoads: ['90', '40', '6', '1'],
  best: 'סתיו עד אביב; רק בגרסה הבטוחה ובבדיקת חסימות ביום היציאה.',
  summary: 'מסלול חוקי לממשית, עיר אובות ועין תמר, כשהחסם במעלה עקרבים מוצג אך אינו יכול למשוך את הניווט אליו.',
  cautions: ['אין להגיע לראש המעלה מכיוון אורון ואין לעקוף חסימה.', 'Waze ו־Google אינם סמכות לפתיחת כביש; הודעות המשטרה והגורמים הרשמיים קובעות.'],
  fuel: 'תדלוק בבאר שבע, דימונה ובערבה; השלמה במצפה רמון בחזרה.',
  duration: 'יום ארוך או יומיים',
  km: 530,
  hours: 7.4,
  corePoints: [
    point('גן לאומי ממשית', 31.0240184, 35.0648415, 'עיר נבטית', 75, 'עיר נבטית־ביזנטית ובה רחובות, כנסיות ומערכות מים, נגישה מן כביש 25.', 'נבטי עד ביזנטי', ['https://www.parks.org.il/reserve-park/%D7%92%D7%9F-%D7%9C%D7%90%D7%95%D7%9E%D7%99-%D7%9E%D7%9E%D7%A9%D7%99%D7%AA/']),
    excludedPoint('מעלה עקרבים — חסם בכביש 227, תיעוד בלבד', 30.9090538, 35.1316261, 'כביש היסטורי חסום', 'הדרך ההיסטורית נשמרת ברשומה כדי להסביר את הניתוק בין ממשית לצפון הערבה.', 'מנדטורי ומודרני', ['https://www.teva.org.il/tracks/842231'], 'הקטע העליון של כביש 227 חסום רשמית ובחלקו פיזית; הנקודה מוחרגת מכל קישור ניווט.'),
    point('עיר אובות', 30.8090441, 35.2441845, 'אתר עתיקות ויישוב', 45, 'אתר בצפון הערבה הסמוך למצד חצבה ולציר 90, שאליו מגיעים מן הדרך החוקית בלבד.', 'מקראי, רומי ומודרני', ['https://www.teva.org.il/tracks/842801']),
    point('עין תמר', 30.9433090, 35.3747349, 'יישוב חקלאי', 30, 'יישוב בכיכר סדום המשמש תחנת מנוחה והמחשה להתיישבות חקלאית בתנאי מלחה וחום.', 'התיישבות מודרנית', ['https://www.ma-tamar.org.il/%D7%A2%D7%99%D7%9F-%D7%AA%D7%9E%D7%A8/']),
  ],
  returnPoints: [MITZPE_RAMON, BEIT_KAMA],
});

const warning015 = route({
  id: 'south-expansion-warning-015',
  title: 'הערבה התיכונה הבטוחה — בלי מואה ובלי חוות האנטילופות',
  area: 'צפון הערבה והערבה התיכונה',
  status: 'WARNING',
  severity: 'major',
  warningReason: 'הגישה למואה כוללת דרך עפר שאינה ברירת מחדל לאופנוע כביש, וחוות האנטילופות סגורה לתיירות מינואר 2026; שתיהן מוחרגות מן הניווט.',
  pattern: 'snake',
  direction: 'דרום',
  secondary: JOE_ALON,
  meetingMinutes: 68,
  level: 'ארוך — בגרסה הסלולה בלבד',
  roadCharacter: 'מסלול נחש סלול דרך כביש 90, עיר אובות, ויידור, מצפור השלום וספיר; חזרה דרך מצפה רמון.',
  roads: ['6', '40', '25', '90', 'דרך השלום', '90', '40', '6', '1'],
  returnRoads: ['90', '40', '6', '1'],
  best: 'אוקטובר עד אפריל, ביומיים, לאחר בדיקת דרך השלום והנחיות מזג אוויר.',
  summary: 'שתי בעיות מקומיות אינן מבטלות את הערבה: המפה הבטוחה עוברת בארבע נקודות סלולות ומחזירה את הקבוצה בציר אחר.',
  cautions: ['אין לפנות לדרך העפר למואה ואין להגיע לחוות האנטילופות הסגורה.', 'דרך השלום מבוצעת רק כשהיא פתוחה וללא כניסה לדרכי מאגרים או עפר.'],
  fuel: 'תדלוק בבאר שבע ובערבה; השלמה במצפה רמון בחזרה.',
  duration: 'יומיים',
  km: 531,
  hours: 8.2,
  corePoints: [
    point('עיר אובות', 30.8090441, 35.2441845, 'אתר עתיקות ויישוב', 45, 'נקודת מורשת סלולה בצפון הערבה, סמוך למצד חצבה ולציר 90.', 'מקראי, רומי ומודרני', ['https://www.teva.org.il/tracks/842801']),
    point('מרכז ויידור, חצבה', 30.7671940, 35.2776930, 'מרכז מבקרים חקלאי', 60, 'מרכז מבקרים המציג חקלאות, מים וחדשנות בערבה התיכונה.', 'חקלאות מודרנית', ['https://goarava.co.il/business/%D7%9E%D7%A8%D7%9B%D7%96-%D7%95%D7%99%D7%93%D7%95%D7%A8-%D7%97%D7%9C%D7%95%D7%9F-%D7%9C%D7%97%D7%A7%D7%9C%D7%90%D7%95%D7%AA-%D7%9E%D7%95%D7%A9%D7%91-%D7%97%D7%A6%D7%91%D7%94/']),
    point('מצפור השלום בדרך השלום', 30.7788143, 35.2934952, 'תצפית גבול', 35, 'תצפית סלולה אל נחל הערבה והרי אדום; נשארים בציר הסלול ובהתאם לפתיחה.', 'גבול השלום עם ירדן', ['https://goarava.co.il/%D7%93%D7%A8%D7%9A-%D7%94%D7%A9%D7%9C%D7%95%D7%9D/']),
    excludedPoint('מואה הנבטית — גישת עפר, תיעוד בלבד', 30.5408572, 35.1621597, 'חאן נבטי בגישת עפר', 'תחנת דרך הבשמים חשובה, אך הסטייה מכביש 90 אינה מתאימה כברירת מחדל לקבוצת אופנועי כביש.', 'נבטי ורומי', ['https://goarava.co.il/business/%D7%9E%D7%95%D7%90%D7%94/'], 'הגישה כוללת כחמישה קילומטרים של דרך עפר; הנקודה מוחרגת מן הניווט של אופנועי כביש.'),
    excludedPoint('חוות האנטילופות — סגורה לתיירות, תיעוד בלבד', 30.5768600, 35.1794700, 'אתר תיירות סגור', 'החווה הייתה מוקד טבע ותיירות בערבה, אך מפעיליה הודיעו על סגירה לתיירות מינואר 2026.', 'תיירות טבע מודרנית', ['https://afrika.co.il/%D7%9E%D7%A4%D7%AA-%D7%90%D7%AA%D7%A8/'], 'האתר סגור לתיירות החל מ־1 בינואר 2026; אין לכלול אותו בניווט או להציגו כתחנת ביקור פעילה.'),
    point('פארק ספיר', 30.6164706, 35.1913355, 'פארק מדברי', 40, 'פארק קהילתי נגיש מן הכביש המשמש חלופת עצירה סלולה ומוצלת יחסית.', 'פיתוח קהילתי', ['https://goarava.co.il/business/%D7%A4%D7%90%D7%A8%D7%A7-%D7%A1%D7%A4%D7%99%D7%A8/']),
  ],
  returnPoints: [MITZPE_RAMON, BEIT_KAMA],
});

const replacements = new Map([
  pass003,
  pass004,
  pass013,
  warning002,
  warning003,
  warning007,
  warning008,
  warning009,
  warning010,
  warning011,
  warning012,
  warning013,
  warning014,
  warning015,
].map((item) => [item.id, item]));

const data = JSON.parse(await readFile(TARGET, 'utf8'));
if (data.document_version !== '2.3.0') throw new Error(`גרסת מסמך בלתי צפויה: ${data.document_version}`);
if (!Array.isArray(data.routes) || data.routes.length !== 30) throw new Error('ציפינו ל־30 מסלולי דרום');

const originalIds = new Set(data.routes.map((item) => item.id));
for (const id of replacements.keys()) {
  if (!originalIds.has(id)) throw new Error(`מסלול להחלפה לא נמצא: ${id}`);
}
data.routes = data.routes.map((item) => replacements.get(item.id) || item);

// תיקוני מקור נקודתיים במסלולים שנשמרו.
for (const id of ['south-expansion-pass-001', 'south-expansion-pass-002']) {
  const item = data.routes.find((candidate) => candidate.id === id);
  const stop = item.core_points.find((candidate) => candidate.name === 'אנדרטת חטיבת הנגב');
  stop.sources = ['https://www.izkor.gov.il/monument/en_1be6781fc599cb2def64efd6d735fedf'];
  item.sources = [...new Set(item.core_points.flatMap((candidate) => candidate.sources || []))];
}

{
  const item = data.routes.find((candidate) => candidate.id === 'south-expansion-pass-006');
  const stop = item.core_points.find((candidate) => candidate.name === 'אנדרטת המייסדים, ירוחם');
  stop.story = 'אנדרטה קהילתית למייסדי ירוחם, סמוך למתחם המורשת העירוני, המספקת נקודת שיחה על ראשית היישוב.';
  stop.story_long = stop.story;
  stop.sources = ['https://visit-yerucham.com/tour-item-attraction/%D7%A2%D7%AA%D7%99%D7%93-%D7%91%D7%9E%D7%93%D7%91%D7%A8-2/'];
  stop.review_state = 'manual_confirmed';
  item.sources = [...new Set(item.core_points.flatMap((candidate) => candidate.sources || []))];
}

{
  const item = data.routes.find((candidate) => candidate.id === 'south-expansion-pass-007');
  const stop = item.core_points.find((candidate) => candidate.name === 'גן לאומי קבר בן גוריון');
  stop.sources = ['https://www.parks.org.il/reserve-park/%D7%92%D7%9F-%D7%9C%D7%90%D7%95%D7%9E%D7%99-%D7%A7%D7%91%D7%A8-%D7%91%D7%9F-%D7%92%D7%95%D7%A8%D7%99%D7%95%D7%9F/'];
  item.sources = [...new Set(item.core_points.flatMap((candidate) => candidate.sources || []))];
}

{
  const item = data.routes.find((candidate) => candidate.id === 'south-expansion-pass-009');
  const stop = item.core_points.find((candidate) => candidate.name === 'נאות הכיכר');
  stop.sources = ['https://www.ma-tamar.org.il/%D7%A0%D7%90%D7%95%D7%AA-%D7%94%D7%9B%D7%99%D7%9B%D7%A8/'];
  item.sources = [...new Set(item.core_points.flatMap((candidate) => candidate.sources || []))];
}

// מסלול 005 הוא לולאה בפועל: החזרה דרך בית קמה שונה מציר היציאה דרך אשדוד.
{
  const item = data.routes.find((candidate) => candidate.id === 'south-expansion-warning-005');
  item.route_pattern = 'loop';
  item.road_character = `${item.road_character} החזרה דרך בית קמה וכביש 40 יוצרת לולאה ולא חזרה באותו ציר.`;
  item.return_roads = ['40', '6', '1'];
}

const statusCounts = data.routes.reduce((counts, item) => {
  counts[item.status] = (counts[item.status] || 0) + 1;
  return counts;
}, {});
const severityCounts = data.routes.filter((item) => item.status === 'WARNING').reduce((counts, item) => {
  counts[item.severity] = (counts[item.severity] || 0) + 1;
  return counts;
}, {});
if (statusCounts.PASS !== 15 || statusCounts.WARNING !== 15) throw new Error(`חלוקת סטטוסים נפגעה: ${JSON.stringify(statusCounts)}`);
for (const severity of ['minor_navigation', 'conditional', 'major']) {
  if (severityCounts[severity] !== 5) throw new Error(`חלוקת חומרה נפגעה: ${JSON.stringify(severityCounts)}`);
}
if (data.routes.some((item) => item.core_points.some((stop) => !stop.story || !Number.isFinite(Number(stop.minutes)) || Number(stop.minutes) <= 0 || !(stop.sources || []).length))) {
  throw new Error('נשארה תחנה ללא סיפור, זמן חיובי או מקור');
}

await writeFile(TARGET, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  routes: data.routes.length,
  pass: statusCounts.PASS,
  warning: statusCounts.WARNING,
  severity: severityCounts,
  replaced: replacements.size,
}, null, 2));
