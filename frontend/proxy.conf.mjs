// Dev-server proxy: the browser talks to http://localhost:4200/api (same origin), the proxy forwards to the API.
//
//   npm start                                  -> remote API (https://api.pianoml.org)
//   API_TARGET=http://localhost:8080 npm start -> local backend
//
// This is the only supported way to run the frontend against an API: the API's auth cookie is
// SameSite=Strict + Secure, its CORS policy does not allow localhost, and CSRF requires the frontend to
// read the XSRF-TOKEN cookie, which JavaScript can only do for cookies of its own site.

const target = process.env.API_TARGET ?? 'https://api.pianoml.org';

const DOMAIN_ATTRIBUTE = /;\s*domain=[^;]*/i;
const EXPIRED = /;\s*max-age=0\s*(?=;|$)/i;

/**
 * Adapts API cookies to http://localhost / http://127.0.0.1:
 * - makes cookies scoped to a production domain (Domain=pianoml.org) host-only, since the browser would reject
 *   them on localhost. The remote API scopes XSRF-TOKEN this way (the proxy strips Origin and targets a
 *   pianoml.org host), and without it every write fails with CSRF_TOKEN_INVALID;
 * - drops a domain cookie that only expires one (Max-Age=0): it targets a cookie that cannot exist on localhost,
 *   and made host-only it could erase the live cookie of the same name;
 * - removes Secure, which browsers refuse on plain-http origins.
 * SameSite=Strict/Lax keep working: every request is same-origin for the browser.
 */
export function rewriteSetCookies(setCookies) {
  return setCookies
    .filter((cookie) => !(DOMAIN_ATTRIBUTE.test(cookie) && EXPIRED.test(cookie)))
    .map((cookie) => cookie.replace(new RegExp(DOMAIN_ATTRIBUTE, 'gi'), '').replace(/;\s*secure(?=\s*;|\s*$)/gi, ''));
}

export default {
  '/api': {
    target,
    secure: true,
    changeOrigin: true,
    pathRewrite: { '^/api': '' },
    // WebSocket upgrades too: the Remote coach socket /api/coach/ws (issue #414)
    ws: true,
    configure: (proxy) => {
      // The browser sends Origin: http://localhost:4200 on POST/PUT/DELETE. Forwarded as-is, the API would
      // treat the call as cross-origin and reject it (localhost is not an allowed CORS origin).
      proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
      // Same for the WebSocket handshake, which the API refuses with an Origin it does not allow
      proxy.on('proxyReqWs', (proxyReq) => proxyReq.removeHeader('origin'));
      proxy.on('proxyRes', (proxyRes) => {
        const setCookie = proxyRes.headers['set-cookie'];
        if (setCookie) {
          proxyRes.headers['set-cookie'] = rewriteSetCookies(setCookie);
        }
      });
    },
  },
};
