export const environment = {
  production: false,
 // Always through the dev-server proxy (proxy.conf.mjs): remote API by default,
 // local backend with `API_TARGET=http://localhost:8080 npm start`.
 // Do not point this at an absolute API URL: cookies (SameSite=Strict, Secure) and CSRF only work same-origin.
 api: "/api"
};
