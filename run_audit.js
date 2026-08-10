
const fs = require('fs');

global.window = global;
global.window.addEventListener = () => {};

require('./data/config-v2.js');
require('./data/legacy-content-v2.js');
require('./data/new-routes-v2.js');
require('./data/expanded-catalog-v3.js');

const routes = window.ROAD_BOOK_V3_EXPANDED.routes || [];
let report = `TOTAL EXPANDED ROUTES: ${routes.length}\n`;

const incompleteRoutes = [];

routes.forEach((r, idx) => {
  const issues = [];
  if (!r.km || r.km === 'לא צוין') issues.push('missing km');
  if (!r.duration || r.duration === 'לא צוין') issues.push('missing duration');
  if (!r.level || r.level === 'לא צוין') issues.push('missing level');
  if (!r.road_character || r.road_character === 'לא צוין') issues.push('missing road_character');
  if (!r.region || r.region === 'לא צוין') issues.push('missing region');
  if (!r.area || r.area === 'לא צוין') issues.push('missing area');
  if (!r.story_big && !r.summary) issues.push('missing summary/story');
  
  const rp = r.road_profile || {};
  const totalProfile = (rp.urban || 0) + (rp.regional || 0) + (rp.winding || 0) + (rp.highway || 0);
  if (totalProfile === 0) issues.push('road_profile_is_zero');
  
  if (r.stops) {
    const emptyStops = r.stops.filter(s => !s.name || !s.kind);
    if (emptyStops.length > 0) issues.push(`${emptyStops.length} empty stops`);
  }
  
  if (issues.length > 0) {
    incompleteRoutes.push({ id: r.id, index: idx+1, title: r.title, issues });
  }
});

report += `\nFOUND ${incompleteRoutes.length} INCOMPLETE ROUTES OUT OF ${routes.length}:\n`;
incompleteRoutes.forEach(r => {
  report += `[${r.index}] ID=${r.id} | ${r.title} => ${r.issues.join(', ')}\n`;
});

fs.writeFileSync('./audit_report.txt', report, 'utf-8');
console.log("Report generated successfully!");
