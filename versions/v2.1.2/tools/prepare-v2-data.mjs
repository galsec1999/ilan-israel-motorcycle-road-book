/**
 * הכנת נתוני גרסה 2
 * גרסת מסמך: 2.0.3
 *
 * סקריפט מכני: שומר צילום של קבצי PWA 1.1.1 ומחלץ את מאגרי התוכן
 * מתוך book.html לקובץ JavaScript חיצוני, בלי לשנות את התוכן המקורי.
 */

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ARCHIVE = join(ROOT, 'versions', 'v1.1.1');
const DATA_DIR = join(ROOT, 'data');

function extractJsonConstant(source, name) {
  const marker = `const ${name}=`;
  const markerAt = source.indexOf(marker);
  if (markerAt < 0) throw new Error(`Missing ${name}`);

  const start = source.indexOf('[', markerAt + marker.length);
  if (start < 0) throw new Error(`Missing JSON array for ${name}`);

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '[' || char === '{') depth += 1;
    else if (char === ']' || char === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(source.slice(start, i + 1));
    }
  }
  throw new Error(`Unterminated JSON for ${name}`);
}

await mkdir(ARCHIVE, { recursive: true });
await mkdir(DATA_DIR, { recursive: true });

for (const name of [
  'book.html',
  'index.html',
  'manifest.webmanifest',
  'offline.html',
  'README_HE.md',
  'robots.txt',
  'sw.js',
]) {
  await cp(join(ROOT, name), join(ARCHIVE, name), { force: false, errorOnExist: true });
}
await cp(join(ROOT, 'icons'), join(ARCHIVE, 'icons'), {
  recursive: true,
  force: false,
  errorOnExist: true,
});

const legacyBook = await readFile(join(ROOT, 'book.html'), 'utf8');
const payload = {
  documentVersion: '2.0.3',
  sourceDocumentVersion: '1.1.1',
  generatedAt: new Date().toISOString(),
  routes: extractJsonConstant(legacyBook, 'ROUTES'),
  multiday: extractJsonConstant(legacyBook, 'MULTIDAY'),
  sources: extractJsonConstant(legacyBook, 'SOURCES'),
  grandTours: extractJsonConstant(legacyBook, 'GRAND_TOURS'),
};

const output = [
  '/**',
  ' * מאגר תוכן קיים לגרסה 2',
  ' * גרסת מסמך: 2.0.3',
  ' * מקור: מסמך 1.1.1; התוכן נשמר ללא שינוי ומנורמל בזמן הריצה.',
  ' */',
  `window.ROAD_BOOK_LEGACY = ${JSON.stringify(payload, null, 2)};`,
  '',
].join('\n');

await writeFile(join(DATA_DIR, 'legacy-content-v2.js'), output, 'utf8');
console.log(JSON.stringify({
  archive: ARCHIVE,
  routes: payload.routes.length,
  multiday: payload.multiday.length,
  sources: payload.sources.length,
  grandTours: payload.grandTours.length,
}, null, 2));
