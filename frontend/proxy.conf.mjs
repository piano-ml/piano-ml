// Dev-server proxy: the browser talks to http://localhost:4200/api (same origin), the proxy forwards to the API.
//
//   npm start                                  -> remote API (https://api.pianoml.org)
//   API_TARGET=http://localhost:8080 npm start -> local backend
//
// This is the only supported way to run the frontend against an API: the API's auth cookie is
// SameSite=Strict + Secure, its CORS policy does not allow localhost, and CSRF requires the frontend to
// read the XSRF-TOKEN cookie, which JavaScript can only do for cookies of its own site.

const target = process.env.API_TARGET ?? 'https://api.pianoml.org';

/**
 * Adapts API cookies to http://localhost / http://127.0.0.1:
 * - drops cookies scoped to a production domain (Domain=...): the browser would reject them anyway;
 * - removes Secure, which browsers refuse on plain-http origins.
 * SameSite=Strict/Lax keep working: every request is same-origin for the browser.
 */
export function rewriteSetCookies(setCookies) {
  return setCookies
    .filter((cookie) => !/;\s*domain=/i.test(cookie))
    .map((cookie) => cookie.replace(/;\s*secure(?=\s*;|\s*$)/gi, ''));
}

export default {
  '/api': {
    target,
    secure: true,
    changeOrigin: true,
    pathRewrite: { '^/api': '' },
    configure: (proxy) => {
      // The browser sends Origin: http://localhost:4200 on POST/PUT/DELETE. Forwarded as-is, the API would
      // treat the call as cross-origin and reject it (localhost is not an allowed CORS origin).
      proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
      proxy.on('proxyRes', (proxyRes) => {
        const setCookie = proxyRes.headers['set-cookie'];
        if (setCookie) {
          proxyRes.headers['set-cookie'] = rewriteSetCookies(setCookie);
        }
      });
    },
  },
};
