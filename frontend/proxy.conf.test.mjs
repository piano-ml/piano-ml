// node --test proxy.conf.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import proxy, { rewriteSetCookies } from './proxy.conf.mjs';

test('removes Secure so the cookie is accepted on http://localhost', () => {
  assert.deepEqual(
    rewriteSetCookies(['Authorization=jwt; Path=/; Max-Age=86400; Secure; HttpOnly; SameSite=Strict']),
    ['Authorization=jwt; Path=/; Max-Age=86400; HttpOnly; SameSite=Strict'],
  );
});

test('removes a trailing Secure attribute', () => {
  assert.deepEqual(rewriteSetCookies(['XSRF-TOKEN=t; Path=/; Secure']), ['XSRF-TOKEN=t; Path=/']);
});

test('keeps cookies without Secure untouched', () => {
  assert.deepEqual(rewriteSetCookies(['XSRF-TOKEN=t; Path=/']), ['XSRF-TOKEN=t; Path=/']);
});

test('does not touch a value or name containing "secure"', () => {
  assert.deepEqual(rewriteSetCookies(['secure_pref=secure; Path=/']), ['secure_pref=secure; Path=/']);
});

test('drops cookies scoped to a production domain', () => {
  assert.deepEqual(
    rewriteSetCookies([
      'Authorization=; Path=/; Domain=.pianoml.org; Max-Age=0; Secure; HttpOnly; SameSite=None',
      'Authorization=jwt; Path=/; Secure; HttpOnly; SameSite=Strict',
    ]),
    ['Authorization=jwt; Path=/; HttpOnly; SameSite=Strict'],
  );
});

test('strips the Origin header and rewrites cookies through the configure hook', () => {
  const handlers = {};
  proxy['/api'].configure({ on: (event, fn) => (handlers[event] = fn) });

  const removed = [];
  handlers.proxyReq({ removeHeader: (name) => removed.push(name) });
  assert.deepEqual(removed, ['origin']);

  const proxyRes = { headers: { 'set-cookie': ['XSRF-TOKEN=t; Path=/; Secure'] } };
  handlers.proxyRes(proxyRes);
  assert.deepEqual(proxyRes.headers['set-cookie'], ['XSRF-TOKEN=t; Path=/']);
});

test('targets the remote API by default', () => {
  assert.equal(proxy['/api'].target, process.env.API_TARGET ?? 'https://api.pianoml.org');
});
