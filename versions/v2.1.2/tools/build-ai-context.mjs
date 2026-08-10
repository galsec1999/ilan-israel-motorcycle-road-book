/**
 * יצירת הקשר מאומת לשירות AI
 * גרסת מסמך: 2.0.3
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const source = await readFile(join(ROOT, 'data', 'legacy-content-v2.js'), 'utf8');
const marker = 'window.ROAD_BOOK_LEGACY = ';
const start = source.indexOf(marker);
if (start < 0) throw new Error('ROAD_BOOK_LEGACY not found');
const payload = JSON.parse(source.slice(start + marker.length).replace(/;\s*$/, ''));

const routes = Object.fromEntries(payload.routes
  .filter((route) => route.verification_level === 'מאומת ממקורות')
  .map((route) => {
    const sources = (route.sources || []).map((url, index) => ({
      source_id: `${route.id}-src-${String(index + 1).padStart(2, '0')}`,
      url,
      scope: 'route',
    }));
    return [route.id, {
      route_id: route.id,
      title: route.title,
      summary: route.summary,
      story: route.story_big,
      cautions: route.cautions,
      checked_on: route.checked_on,
      sources,
      source_scope_note: 'המקורות משויכים למסלול כולו ולא לכל טענה בנפרד.',
      stops: (route.stops || []).map((stop, index) => ({
        stop_id: `${route.id}-s${String(index + 1).padStart(3, '0')}`,
        name: stop.name,
        kind: stop.kind,
        story: stop.story_long || stop.story,
        era: stop.era,
        source_ids: sources.map((item) => item.source_id),
      })),
    }];
  }));

const output = `/**\n * הקשר AI שנוצר אוטומטית\n * גרסת מסמך: 2.0.3\n * מקורות משויכים ברמת המסלול; אין לטעון לשיוך מדויק לכל טענה.\n */\nexport const ROUTE_CONTEXT = ${JSON.stringify(routes, null, 2)};\n`;
await writeFile(join(ROOT, 'api-worker', 'src', 'context.generated.js'), output, 'utf8');
console.log(JSON.stringify({ routes: Object.keys(routes).length, stops: Object.values(routes).reduce((n, route) => n + route.stops.length, 0) }));
