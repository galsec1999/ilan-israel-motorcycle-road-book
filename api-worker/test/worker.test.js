/** בדיקות Worker לעוזר המסלול — גרסה 2.2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { ROUTE_CONTEXT } from '../src/context.generated.js';

const origin = 'https://example.github.io';
const env = {
  ALLOWED_ORIGIN: origin,
  OPENAI_API_KEY: 'test-only-not-a-real-key',
  SESSION_HMAC_SECRET: 'test-session-secret',
};

function request(body, requestOrigin = origin, path = '/api/v2/ask') {
  return new Request(`https://worker.example${path}`, {
    method: 'POST',
    headers: { origin: requestOrigin, 'content-type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' },
    body: JSON.stringify(body),
  });
}

async function withOpenAiStub(answer, callback, onResponseRequest = null) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/v1/moderations')) return Response.json({ results: [{ flagged: false }] });
    if (String(url).endsWith('/v1/responses')) {
      onResponseRequest?.(JSON.parse(options.body));
      return Response.json({ output_text: answer });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try { await callback(); }
  finally { globalThis.fetch = originalFetch; }
}

for (const [supportLevel, label] of [
  ['route_scope', 'verified'],
  ['limited_route_scope', 'limited legacy'],
  ['candidate_scope', 'candidate'],
]) {
  test(`worker accepts a ${label} dossier and preserves its support level`, async () => {
    const route = Object.values(ROUTE_CONTEXT).find((item) => item.support_level === supportLevel);
    assert.ok(route);
    let prompt = '';
    await withOpenAiStub('תשובה קצרה מתוך תיק המסלול.', async () => {
      const response = await worker.fetch(request({
        route_id: route.route_id,
        stop_id: route.stops[0].stop_id,
        question: 'מה מתועד על המקום?'
      }), env);
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.support, supportLevel);
      assert.equal(data.verification_level_he, route.verification_level);
      assert.deepEqual(data.sources, route.sources.map(({ source_id, url }) => ({ source_id, url })));
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
    }, (body) => { prompt = body.input[0].content; });
    assert.match(prompt, new RegExp(route.verification_level));
    if (supportLevel === 'candidate_scope') assert.match(prompt, /לא מסלול רכיבה מאושר/);
  });
}

test('worker accepts the community c-ID family', async () => {
  const route = ROUTE_CONTEXT.c001;
  assert.ok(route);
  await withOpenAiStub('מידע קהילתי מתוך הספר.', async () => {
    const response = await worker.fetch(request({ route_id: route.route_id, question: 'מה מיוחד במסלול?' }), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).support, 'limited_route_scope');
  });
});

test('worker rejects unknown route and stop identifiers before calling a provider', async () => {
  const route = Object.values(ROUTE_CONTEXT)[0];
  for (const body of [
    { route_id: 'r999', question: 'בדיקה' },
    { route_id: route.route_id, stop_id: `${route.route_id}-s999`, question: 'בדיקה' },
  ]) {
    const response = await worker.fetch(request(body), env);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'INVALID_INPUT');
  }
});

test('worker rejects generated URLs and lets the client fall back locally', async () => {
  const route = Object.values(ROUTE_CONTEXT)[0];
  await withOpenAiStub('מידע נוסף נמצא ב־https://invalid.example', async () => {
    const response = await worker.fetch(request({ route_id: route.route_id, question: 'מה מיוחד במסלול?' }), env);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, 'OUTPUT_REJECTED');
  });
});

test('worker rejects an unapproved origin without exposing CORS permission', async () => {
  const route = Object.values(ROUTE_CONTEXT)[0];
  const response = await worker.fetch(request({ route_id: route.route_id, question: 'בדיקה' }, 'https://attacker.example'), env);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('health response reports the single release version', async () => {
  const response = await worker.fetch(new Request('https://worker.example/', { headers: { origin } }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { service: 'ilan-road-book-route-assistant', version: '2.2.0', status: 'ok' });
});
