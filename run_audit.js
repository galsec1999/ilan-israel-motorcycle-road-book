
const fs = require('fs');

// גרסת מסמך: 4.4.1 | גרסת מוצר: 4.4.1

global.window = global;
global.window.addEventListener = () => {};

require('./data/config-v2.js');
require('./data/legacy-content-v2.js');
require('./data/new-routes-v2.js');
require('./data/expanded-catalog-v3.js');

const routes = window.ROAD_BOOK_V3_EXPANDED.routes || [];
let report = `בדיקת קטלוג ומפות — גרסת מסמך 4.4.1 | גרסת מוצר 4.4.1\n`;
report += `TOTAL EXPANDED ROUTES: ${routes.length}\n`;

const incompleteRoutes = [];
const invalidMapUrls = [];
const sameEndpointMapLoops = [];

routes.forEach((raw, idx) => {
  const waypoints = (raw.waypoints || []).filter(Boolean);
  const r = {
    ...raw,
    start: raw.start || waypoints[0],
    end: raw.end || waypoints.at(-1),
    summary: raw.summary || raw.description,
    duration: raw.duration || raw.duration_hours,
    km: raw.km || raw.distance_km,
    level: raw.level || raw.difficulty_level,
    roads: raw.roads || (raw.main_roads || []).join(', '),
    stops: raw.stops?.length ? raw.stops : waypoints.map((name) => ({ name, kind: 'נקודת דרך' })),
    map_points: raw.map_points?.length >= 2 ? raw.map_points : waypoints,
  };
  const issues = [];
  if (!r.km || r.km === 'לא צוין') issues.push('missing km');
  if (!r.duration || r.duration === 'לא צוין') issues.push('missing duration');
  if (!r.level || r.level === 'לא צוין') issues.push('missing level');
  if (!r.road_character || r.road_character === 'לא צוין') issues.push('missing road_character');
  if (!r.region || r.region === 'לא צוין') issues.push('missing region');
  if (!r.area || r.area === 'לא צוין') issues.push('missing area');
  if (!r.story_big && !r.summary) issues.push('missing summary/story');
  
  const rp = r.road_profile || {};
  const totalProfile = (rp.urban || 0) + (rp.regional || 0) + (rp.winding || 0) + (rp.highway || 0)
    + (rp.fast || 0) + (rp.twisty || 0) + (rp.local || 0) + (rp.gravel || 0);
  if (totalProfile === 0) issues.push('road_profile_is_zero');

  const navigationPoints = r.map_points?.length >= 2
    ? r.map_points.filter(Boolean)
    : [r.start, ...(r.stops || []).map((stop) => stop.navigation_name === null ? '' : (stop.navigation_name || stop.name)), r.end].filter(Boolean);
  if (navigationPoints.length < 2) issues.push('missing navigation points');
  
  if (r.stops) {
    const emptyStops = r.stops.filter(s => !s.name || !s.kind);
    if (emptyStops.length > 0) issues.push(`${emptyStops.length} empty stops`);
  }
  
  if (issues.length > 0) {
    incompleteRoutes.push({ id: r.id, index: idx+1, title: r.title, issues });
  }

  if (raw.full_maps_url) {
    try {
      const mapUrl = new URL(raw.full_maps_url);
      if (mapUrl.protocol !== 'https:' || !/(^|\.)google\.com$/.test(mapUrl.hostname)) invalidMapUrls.push(raw.id);
      const origin = mapUrl.searchParams.get('origin');
      const destination = mapUrl.searchParams.get('destination');
      if (origin && destination && origin === destination) {
        const points = (raw.full_map_points || []).filter(Boolean);
        if (points.length < 3 || points[0] !== points.at(-1)) invalidMapUrls.push(`${raw.id}: loop cannot be split`);
        else sameEndpointMapLoops.push(raw.id);
      }
    } catch {
      invalidMapUrls.push(raw.id);
    }
  }
});

report += `\nFOUND ${incompleteRoutes.length} INCOMPLETE ROUTES OUT OF ${routes.length}:\n`;
incompleteRoutes.forEach(r => {
  report += `[${r.index}] ID=${r.id} | ${r.title} => ${r.issues.join(', ')}\n`;
});
report += `\nEXPLICIT FULL MAP URLS: ${routes.filter((route) => route.full_maps_url).length}\n`;
report += `LOOP URLS SPLIT INTO OUTBOUND/RETURN BY THE APP: ${sameEndpointMapLoops.length}\n`;
report += `INVALID OR UNSPLITTABLE MAP URLS: ${invalidMapUrls.length}\n`;
invalidMapUrls.forEach((id) => { report += `INVALID MAP: ${id}\n`; });

fs.writeFileSync('./audit_report.txt', report, 'utf-8');
console.log("Report generated successfully!");
