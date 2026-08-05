/** בדיקות Worker לשאלות AI — גרסת מסמך 2.0.3 */
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
const tRoute = Object.values(ROUTE_CONTEXT).find((route) => route.route_id.startsWith('t'));

function request(body, requestOrigin = origin) {
  return new Request('https://worker.example/api/v2/ask', {
    method: 'POST',
    headers: { origin: requestOrigin, 'content-type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' },
    body: JSON.stringify(body),
  });
}

test('worker accepts all verified legacy ID families and returns only server sources', async () => {
  assert.ok(tRoute, 'a verified t-route must exist in the generated context');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/v1/moderations')) return Response.json({ results: [{ flagged: false }] });
    if (String(url).endsWith('/v1/responses')) return Response.json({ output_text: 'תשובה קצרה מתוך החומר המאומת.' });
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const response = await worker.fetch(request({
      route_id: tRoute.route_id,
      stop_id: tRoute.stops[0].stop_id,
      question: 'למה המקום הזה חשוב?',
    }), env);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.support, 'route_scope');
    assert.deepEqual(data.sources, tRoute.sources.map(({ source_id, url }) => ({ source_id, url })));
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker rejects generated URLs and lets the client fall back locally', async () => {
  const route = Object.values(ROUTE_CONTEXT)[0];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/v1/moderations')) return Response.json({ results: [{ flagged: false }] });
    return Response.json({ output_text: 'מידע נוסף נמצא ב־https://invalid.example' });
  };
  try {
    const response = await worker.fetch(request({ route_id: route.route_id, question: 'מה מיוחד במסלול?' }), env);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, 'OUTPUT_REJECTED');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker rejects an unapproved origin without exposing CORS permission', async () => {
  const route = Object.values(ROUTE_CONTEXT)[0];
  const response = await worker.fetch(request({ route_id: route.route_id, question: 'בדיקה' }, 'https://attacker.example'), env);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});
