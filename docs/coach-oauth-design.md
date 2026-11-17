# Coach: OAuth 2.1 for hosted chat applications (design)

Phase 10 of `docs/coach-external-harness.md` (issue #414). Design only: no code in this phase. The implementation plan is in section 8.

**Decisions (2026-11-17).**

- **Clients can be hosted anywhere**: a hosted chat application, a desktop or command-line program on the user's machine, a self-hosted harness on any domain, or a web page running in the user's browser. Nothing in the design may assume where the client runs (section 2.6).
- **The OAuth endpoints are implemented in the backend, without Spring Security's authorization server.** Spring Security keeps routing requests to the existing filter chains; the protocol itself is plain controllers and services (section 5).
- **Any client metadata URL is accepted** (open CIMD trust policy), behind the SSRF guard.
- **A grant lasts 365 days** from consent, absolute; refresh tokens rotate within it. After that the user consents again.

**Goal.** A user adds `https://api.pianoml.org/mcp` to a hosted chat application (the Claude apps first), is sent to PianoML to log in and approve, and the application gets an access token. The result of the flow is a `coach_grant` row of kind `oauth`: everything after authentication (the `/mcp` chain, `GrantPrincipal`, scopes, dispatcher, audit, limits) stays as it is. Personal access tokens (`pml_…`) keep working beside it.

**Rule.** Follow the MCP authorization specification; special-case no host. Where a host is stricter than the specification, meet the stricter rule if it stays within the specification.

Sources (read 2026-11-17):

- MCP authorization, revision 2025-11-25: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- Claude, Authentication for connectors: https://claude.com/docs/connectors/building/authentication
- OpenAI Apps SDK, authentication: https://developers.openai.com/apps-sdk/build/auth
- Spring Security 7.0 authorization server: https://docs.spring.io/spring-security/reference/7.0/servlet/oauth2/authorization-server/index.html, protocol-endpoints.html, core-model-components.html

---

## 1. What the two hosts require

The second host is ChatGPT (apps and connectors): another vendor, OAuth-capable for remote MCP servers.

| Topic | MCP spec 2025-11-25 | Claude apps (claude.ai, Desktop, mobile; Claude Code) | ChatGPT |
|---|---|---|---|
| Discovery start | 401 with `WWW-Authenticate: Bearer resource_metadata=…`, or well-known probing | A **401 is required**; probing `/.well-known/oauth-protected-resource/<path>` then root is a fallback | 401 header or `/.well-known/oauth-protected-resource` |
| Protected resource metadata | MUST, with `authorization_servers` | `resource` must equal the URL the user enters, path included; only the **first** authorization server is used | `resource` is the canonical HTTPS identifier |
| AS metadata | RFC 8414 or OIDC discovery | Same; must be reachable from Anthropic's egress range `160.79.104.0/21` | Same; `issuer` must match `authorization_servers` |
| Client identification | CIMD SHOULD, DCR MAY, pre-registration | CIMD only if metadata has `client_id_metadata_document_supported: true` **and** `"none"` in `token_endpoint_auth_methods_supported`; otherwise DCR (needs `registration_endpoint`). DCR registers a new client on every fresh connection | **Prefers CIMD**; DCR once per connection otherwise |
| Redirect URI | Registered, exact match; `localhost` or HTTPS | `https://claude.ai/api/mcp/auth_callback` (may move to `https://claude.com/api/mcp/auth_callback`); Claude Code: loopback `http://localhost:<any>/callback` and `http://127.0.0.1:<any>/callback`, port-agnostic | `https://chatgpt.com/connector_platform_oauth_redirect` when the AS supports RFC 9207; `https://chatgpt.com/connector/oauth/{callback_id}` otherwise |
| PKCE | MUST, S256; `code_challenge_methods_supported` required | S256 on every request | S256; servers without `code_challenge_methods_supported` are unsupported |
| `resource` (RFC 8707) | Clients MUST send it; servers MUST check the audience | Sent | Sent on authorization and token requests; copy it into the token audience |
| Issuer in response (RFC 9207) | (not required) | (not mentioned) | `authorization_response_iss_parameter_supported: true` and `iss` in every response, exact match, or the response is rejected |
| Scopes | `scope` in the 401 challenge, else `scopes_supported` | Same; appends `offline_access` when the AS lists it | Requests advertised OIDC scopes by default |
| Refresh | Public clients: rotate refresh tokens | Refreshes on 401 and up to 5 min before expiry; rotate for public clients; `invalid_grant` when dead | Normal expiry and rotation |
| Token endpoint | | `application/x-www-form-urlencoded`; **10 s** limit (30 s for refresh), also for discovery and registration | `none` or `private_key_jwt` for CIMD |
| Where calls come from | | Anthropic servers, `160.79.104.0/21` | OpenAI servers; mTLS client certificate and published egress ranges |

**Origin header.** Neither host's documentation says whether requests to `/mcp` carry an `Origin` header; calls from their servers most likely do not. Clients running in a browser always send one. Since clients can be hosted anywhere, `/mcp` accepts any `Origin` (section 2.6).

**Consequence.** One server design serves both hosts: CIMD with public clients, DCR as a fallback, PKCE S256, `resource` binding, RFC 9207 `iss`, refresh rotation, a 401 challenge. No host-specific code path is needed.

---

## 2. What the server implements

### 2.1 Discovery

- **401 challenge on `/mcp`.** The `/mcp` chain answers a missing or invalid token with
  `WWW-Authenticate: Bearer resource_metadata="https://api.pianoml.org/.well-known/oauth-protected-resource/mcp", scope="practice:read scores:read player:control"`.
  An insufficient scope stays a tool result (`FORBIDDEN_SCOPE`), not an HTTP 403: tools are listed to every grant and refused per call, which a step-up flow does not improve.
- **Protected resource metadata (RFC 9728)** at `/.well-known/oauth-protected-resource/mcp` and at `/.well-known/oauth-protected-resource`:
  `resource: "https://api.pianoml.org/mcp"`, `authorization_servers: ["https://api.pianoml.org"]`, `scopes_supported: ["practice:read", "scores:read", "player:control"]`, `bearer_methods_supported: ["header"]`.
- **Authorization server metadata (RFC 8414)** at `/.well-known/oauth-authorization-server`:
  `issuer: "https://api.pianoml.org"`, `authorization_endpoint: …/oauth/authorize`, `token_endpoint: …/oauth/token`, `registration_endpoint: …/oauth/register`, `revocation_endpoint: …/oauth/revoke`, `response_types_supported: ["code"]`, `grant_types_supported: ["authorization_code", "refresh_token"]`, `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none"]`, `client_id_metadata_document_supported: true`, `authorization_response_iss_parameter_supported: true`, `scopes_supported: ["practice:read", "scores:read", "player:control", "offline_access"]`.
  No OIDC discovery: PianoML issues no ID tokens.

The canonical resource is `https://api.pianoml.org/mcp` (no trailing slash): the Connect page shows exactly that URL, because Claude compares `resource` with what the user typed.

**`resource` parameter.** A request naming another resource is refused (`invalid_target`). A request without it is accepted and bound to the canonical resource: the specification requires clients to send it, but older clients do not, and there is only one resource to mean.

### 2.2 Clients

Public clients only (`token_endpoint_auth_method: none`, PKCE). No client secrets to store or leak.

**CIMD** (client id is an HTTPS URL):

- Fetch the document when an unknown URL-shaped `client_id` arrives; cache it per `Cache-Control`, at most 24 hours.
- SSRF guard: HTTPS only, port 443, no redirects, a public address only (resolve the host and refuse loopback, private, link-local and metadata ranges, also after resolution), 5 s timeout, 16 KB maximum.
- Check: valid JSON; `client_id` equals the URL exactly; `client_name` and `redirect_uris` present; the requested `redirect_uri` is in `redirect_uris` (loopback rule below).
- Trust policy: **open, decided**: any HTTPS client id, on any host. The consent page shows the client id's host prominently, with the self-declared client name next to it, so the user judges who asks.

**DCR** (RFC 7591), the fallback both hosts use when CIMD is missing:

- Open registration (no initial access token: hosts register without user interaction). Spring's endpoint requires one by default (`setOpenRegistrationAllowed(true)` would change that), which is one reason for section 5.
- Accept only `token_endpoint_auth_method: none`, `grant_types` ⊆ {authorization_code, refresh_token}, `response_types: ["code"]`, redirect URIs that are HTTPS or loopback, at most 5 of them, `client_name` at most 80 characters.
- Rate limit per IP (registration is unauthenticated). Delete clients that never completed an authorization within 24 hours, and clients unused for 90 days: Claude registers a new client on every fresh connection.

**Redirect URIs.** Any HTTPS URI on any host, or a loopback URI (`http://localhost`, `http://127.0.0.1`, `http://[::1]`), as the MCP specification allows; nothing else (no plain `http` on other hosts, no custom schemes). Exact match against the registered list, except loopback, which matches with the port ignored (RFC 8252 §7.3; Claude Code needs it for both `localhost` and `127.0.0.1`).

### 2.3 Authorization and consent

The session cookie is `HttpOnly; Secure; SameSite=Strict`, host-only on `api.pianoml.org` (fact 10 of the coach specification). The browser **does not send it** on the top-level navigation that arrives from `claude.ai` or `chatgpt.com`: a cross-site request. An authorization endpoint that looked for the cookie would see every user as logged out. Hence two steps:

1. **`GET /oauth/authorize`** (API host, no session expected). Validates `response_type=code`, `client_id` (CIMD fetch or DCR row), `redirect_uri`, `code_challenge` with `code_challenge_method=S256`, `resource` = the canonical resource, `scope` ⊆ supported (`offline_access` accepted and ignored), `state` present.
   - Until `client_id` and `redirect_uri` are validated, an error is an HTML error page on PianoML, never a redirect (no open redirect).
   - After that, errors redirect to `redirect_uri` with `error`, `state` and `iss`.
   - On success: store the request server side (`coach_oauth_request`, random id, 10 minutes, every validated parameter) and redirect to the SPA: `https://www.pianoml.org/coach/authorize?request=<id>`.
2. **Consent page `/coach/authorize`** (SPA, same site as the API: the cookie travels again on its XHR calls).
   - Not logged in: the normal login, back here through `return-url.ts`.
   - `GET /oauth/requests/{id}` (session) returns what to show: client name, client id host (or "self-declared name, unverified" for a DCR client), the redirect URI's host, the scopes with one line each, and a warning when the only redirect URIs are loopback ones.
   - Approve or refuse: `POST /oauth/requests/{id}/decision` (session + CSRF), body `{ approve, scopes }` where `scopes` may narrow the request. The answer is `{ redirectUrl }`: `redirect_uri?code=…&state=…&iss=https://api.pianoml.org`, or `?error=access_denied&state=…&iss=…`. The SPA navigates there.
   - The request id is single use, bound to the user who decides, and expires.

**Authorization code.** 32 random bytes; stored hashed; 60 seconds; single use; bound to the client, the redirect URI, the PKCE challenge, the resource, the granted scopes and the user. A second use revokes what the first one produced.

**Clickjacking.** The consent page sends `Content-Security-Policy: frame-ancestors 'none'` (the SSR server sets it for this route).

### 2.4 Tokens

- **Token endpoint** `POST /oauth/token`, `application/x-www-form-urlencoded`, public clients (`client_id` in the body, no secret).
  - `authorization_code`: checks `code`, `redirect_uri`, `client_id`, `code_verifier` against the S256 challenge, `resource`. Creates the `coach_grant` row (kind `oauth`, `name` = the client name, scopes = granted, `expires_at` = consent date + **365 days, absolute**), then an access token and a refresh token.
  - `refresh_token`: rotation. The used refresh token is marked used and a new pair is returned in the same response. A refresh token used twice means theft: the grant is revoked (all its tokens die) and `invalid_grant` is returned.
  - Errors follow RFC 6749 (`invalid_grant`, `invalid_client`, `invalid_request`), JSON body, `Cache-Control: no-store`.
- **Access token.** Opaque, stored hashed, **1 hour**, bound to the grant and the resource. Format `pmo_<43 base64url characters>`, looked up by its SHA-256: its own prefix, so personal and OAuth tokens are told apart and secret scanners can recognize both.
- **Refresh token.** Opaque (`pmr_<43 base64url characters>`), stored hashed, 60 days, rotated on each use, never past the grant's expiry: an active connection lasts until the grant's 365 days, then the client gets `invalid_grant` and the user consents again.
- **Revocation** `POST /oauth/revoke` (RFC 7009) for clients; users revoke on the account page as today.
- **On `/mcp`.** `GrantAuthenticationFilter` accepts `pml_` (personal) and `pmo_` (OAuth access) tokens. For `pmo_` it checks expiry, the grant (not revoked, not expired) and the audience (`resource` = canonical), then builds the same `GrantPrincipal`.

### 2.5 Grants

- One live OAuth grant per (user, client id). A new consent for the same client revokes the previous grant: the Claude web, Desktop and mobile apps share one client and would otherwise pile up grants.
- OAuth grants and personal tokens have separate limits (5 each), so connecting an application never requires revoking a personal token.
- The account page lists OAuth grants beside personal tokens: client name, client host, scopes, last use, the same Revoke button. Revoking kills the access and refresh tokens at once.
- Password reset (when it exists) and account deletion revoke or delete them, as for personal tokens.

### 2.6 Clients hosted anywhere

Where the client runs changes three things: how it is identified, where it is sent back, and whether a browser sits between it and PianoML.

| Client | Identification | Redirect | Browser rules |
|---|---|---|---|
| Hosted chat application (Claude apps, ChatGPT) | CIMD or DCR | HTTPS on its domain | none (server-to-server) |
| Desktop or command-line program (Claude Code, an IDE) | CIMD or DCR | loopback, any port | none |
| Self-hosted harness on any domain | CIMD or DCR | HTTPS on its domain | none |
| Web page running the client in the browser (MCP Inspector, a web harness) | CIMD or DCR | HTTPS on its domain, or loopback | **CORS and `Origin`** |

What makes the last row work:

- **`/mcp` accepts any `Origin`.** It reads only a bearer token from the `Authorization` header and never a cookie, so a page on another site cannot act with someone else's credentials: there are no ambient credentials to abuse. The `coach.mcp.allowed-origins` refusal of the coach specification (section 2.3) is removed. The Remote coach WebSocket keeps its own Origin check: only PianoML's pages open it.
- **CORS without credentials** on `/mcp`, `/oauth/token`, `/oauth/register`, `/oauth/revoke` and the well-known documents: `Access-Control-Allow-Origin: *`, never `Allow-Credentials`; allowed methods `GET, POST, OPTIONS`; allowed headers `Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID`; exposed headers `WWW-Authenticate, Mcp-Session-Id`. Preflight `OPTIONS` requests are answered before authentication.
- **`/oauth/authorize` is a navigation**, not a fetch: no CORS involved, whatever the client.
- **Rate limits per IP** on unauthenticated endpoints (registration, token) must tolerate many users behind one address (companies, mobile carriers): limits generous enough for that, plus per-client limits once the client is known.

Clients that support neither CIMD nor DCR are registered by hand by the user (section 7, question 1).

### 2.7 Device code (optional, phase O6)

For a client on a machine where no browser can reach it: Claude Code or a harness over SSH on a server, a terminal, a headless box. The loopback redirect of 2.2 needs a browser on that same machine. The OAuth 2.0 Device Authorization Grant (RFC 8628) needs none: the client shows a short code, and the user approves on any device, the phone included.

**Client support is the open point.** The MCP authorization specification does not define the device flow and neither host documents it. The server side is built only when a client that supports it needs it (phase O6); until then such clients use a personal access token.

Flow:

1. **`POST /oauth/device_authorization`** (form-urlencoded, public client, CORS without credentials): `client_id`, `scope`, `resource`. Answer: `device_code` (32 random bytes, stored hashed), `user_code` (8 characters from `BCDFGHJKLMNPQRSTVWXZ`, shown `BCDF-GHJK`, stored hashed), `verification_uri: https://www.pianoml.org/device`, `verification_uri_complete: …/device?code=BCDF-GHJK`, `expires_in: 600`, `interval: 5`.
2. **The client shows** the URL and the code (or a QR code of `verification_uri_complete`) and starts polling.
3. **SPA page `/device`** (same site as the API, so the session works): login if needed, enter the code (prefilled from `?code=`), then the same consent content as 2.3 (client name and host, scopes) plus a phishing warning: "Approve only if you started this connection yourself and see the same code on that device." Decision by `POST /oauth/device/decision` (session + CSRF), body `{ userCode, approve, scopes }`.
4. **The client polls** `POST /oauth/token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code`, `device_code`, `client_id`. Answers: `authorization_pending` while undecided, `slow_down` when it polls faster than `interval` (the interval grows by 5 s), `access_denied` after a refusal, `expired_token` after 10 minutes; on approval the same grant and token pair as 2.4 (365-day grant, `pmo_` access token, rotated refresh token). The device code is single use.

Safety:

- **User-code guessing:** 20⁸ ≈ 2.6 × 10¹⁰ codes, at most 5 wrong entries per session per 10 minutes and a per-IP limit; a code is bound to the user who enters it first.
- **Phishing** (an attacker starts a flow and sends its code to a victim): the warning above, the client's name and host on the page, and the grant visible on the account page with its Revoke button.
- No redirect URI is involved, so the redirect rules of 2.2 do not apply; the client must still be identified by CIMD or DCR.

Changes elsewhere when O6 is built: the metadata of 2.1 adds `device_authorization_endpoint` and the device grant type to `grant_types_supported`; DCR accepts that grant type and, for a client that only uses it, no redirect URIs; the state is polled from Postgres, so any instance can answer any poll.

---

## 3. Data model (Liquibase)

```
coach_oauth_client   client_id varchar(500) pk, kind ('cimd' | 'dcr'), client_name varchar(80),
                     redirect_uris text (JSON), metadata_fetched_at, metadata_expires_at,
                     created_at, last_used_at
coach_oauth_request  id char(64) pk (hash of the request id), client_id, redirect_uri, code_challenge,
                     scopes, resource, state varchar(500), user_id null, created_at, expires_at
coach_oauth_code     code_hash char(64) pk, client_id, redirect_uri, code_challenge, scopes, resource,
                     user_id fk cascade, created_at, expires_at, used_at, grant_id null
coach_oauth_token    token_hash char(64) pk, grant_id fk coach_grant cascade, kind ('access' | 'refresh'),
                     client_id, resource, created_at, expires_at, used_at, replaced_by null
coach_grant          + client_id varchar(500) null (OAuth grants)
coach_oauth_device   device_code_hash char(64) pk, user_code_hash char(64) unique, client_id, scopes,
                     resource, user_id null, status ('pending' | 'approved' | 'denied'), interval_seconds,
                     last_polled_at, created_at, expires_at, used_at     -- phase O6 only
```

Every table is cleaned daily (expired requests and codes, used and expired tokens, unused clients), the way the other coach jobs are.

---

## 4. Endpoints and security chains

| Endpoint | Chain | Authentication |
|---|---|---|
| `/.well-known/oauth-protected-resource`, `…/mcp`, `/.well-known/oauth-authorization-server` | main, explicit `permitAll` GET matchers | none; CORS `*` without credentials |
| `GET /oauth/authorize` | new OAuth chain | none (a browser navigation) |
| `POST /oauth/token`, `POST /oauth/register`, `POST /oauth/revoke` | new OAuth chain | none (public clients); no CSRF (no cookie is read); CORS `*` without credentials; rate-limited |
| `GET /oauth/requests/{id}`, `POST /oauth/requests/{id}/decision` | main chain | cookie session; CSRF on the POST; same-site only (PianoML's consent page) |
| `POST /oauth/device_authorization` (O6) | OAuth chain | none (public client); CORS `*` without credentials; rate-limited |
| `POST /oauth/device/decision` (O6) | main chain | cookie session; CSRF |
| `/mcp/**` | existing `/mcp` chain | `pml_` or `pmo_` bearer; 401 with the challenge; any `Origin`; CORS `*` without credentials |

The OAuth chain (`/oauth/authorize`, `/oauth/token`, `/oauth/register`, `/oauth/revoke`) reads no cookie at all, like the `/mcp` chain: these endpoints must work without the session and must never be turned into a session.

**Latency.** Claude gives discovery, registration and token endpoints 10 seconds. With `spring.main.lazy-initialization=true` the first request to a new instance builds beans on the way: the OAuth components are created eagerly (`@Lazy(false)`), and the metadata documents are static.

**Network.** The well-known paths and the OAuth endpoints must be reachable from `160.79.104.0/21` (Anthropic) and OpenAI's ranges: check that nothing at the edge (rate limiting, bot protection) blocks server-to-server calls without a browser.

---

## 5. Implementation: plain endpoints, no Spring authorization server

**Decided:** the protocol is implemented in the backend as plain controllers and services on top of the coach tables. Spring Security's authorization server module is not used. Spring Security keeps its existing role: the filter chains route `/oauth/**`, `/mcp/**` and the rest, and read no cookie where none is expected.

Why it fits better here:

1. **CIMD is needed in practice** (ChatGPT prefers it, Claude uses it when advertised, and it avoids a DCR client per connection); the Spring reference does not list it.
2. **The login and consent step** must work without the session on the arriving request and across several stateless instances (section 2.3): a stored request and an SPA consent page, which does not match Spring's authorization endpoint.
3. **One token store**, `coach_grant` and its tables, already used by the account page, the `/mcp` chain and the audit.
4. **A small surface:** five endpoints, public clients only, one resource, S256 only, opaque tokens, `resource` binding and `iss` explicit.

The risk is getting a protocol rule wrong (PKCE, code single use, refresh rotation, redirect matching). Mitigations: one test per rule of this document, the RFC 7636 test vectors, constant-time comparisons for every secret and hash, and a run of an OAuth conformance tool against staging before release (phase O5).

## 6. What stays as it is

Scopes, `GrantPrincipal`, the `/mcp` chain rules (no cookie, `Origin` refused unless allow-listed), the dispatcher, the audit, the rate limits, the Remote coach bridge, personal access tokens.

---

## 7. Questions still open

1. **Clients without CIMD or DCR** (a "Client ID" field to fill in, nothing automatic: older MCP clients, home-made harnesses on a generic OAuth library). **Decided:** no account-page form for now. Registration is open, so the user registers the client with one `curl` call to `/oauth/register` and pastes the returned `client_id` (recipe in `docs/coach-mcp-setup.md`, phase O5). Such a client must complete its first authorization within the 24-hour cleanup window of 2.2. A "Register an OAuth client" form (a `manual` kind owned by the user, never cleaned up) is added only when a real user needs it. Clients without OAuth at all use a personal access token.
2. **Connector directory.** Listing PianoML in Claude's directory could also use Anthropic-held client credentials (a confidential client). Out of scope; nothing here prevents it.

## 8. Implementation plan

Five phases, then one optional phase (O6), each one issue and one pull request, in the format of section 7 of the coach specification (common rules apply).

### Phase O1. Discovery, the 401 challenge, clients anywhere (done)

*Implemented: `coach/oauth/` (`CoachOAuthSettings`, `OAuthMetadataController`, `McpAuthenticationEntryPoint`, `PublicCors`), tests `CoachOAuthDiscoveryTest`, `CoachOAuthSettingsTest`, `CoachGrantTest`. One addition to the plan: the property `coach.oauth.enabled` (default `false`). While it is off the discovery documents answer 404 and the challenge is a plain `Bearer realm="PianoML"` (with `error="invalid_token"` when a token was sent), so no client starts a flow whose endpoints do not exist yet. Turn it on with phase O4.*

Build: the two metadata documents (2.1) as static JSON from configuration (`coach.oauth.issuer`, `coach.oauth.resource`); the `WWW-Authenticate` challenge on 401 from the `/mcp` chain; CORS without credentials on `/mcp` and the well-known documents, with preflight answered before authentication (2.6); remove the `Origin` refusal of `/mcp` and the `coach.mcp.allowed-origins` property, and update section 2.3 of the coach specification and `CoachGrantTest`/`McpOriginFilterTest` accordingly.
Tests: documents served at the three paths with every field of 2.1; an anonymous `/mcp` call gets 401 with the exact challenge, readable from a browser (`WWW-Authenticate` exposed); a `pml_` token works with and without an `Origin` header from any site; a preflight from any origin gets the CORS headers and no `Allow-Credentials`; a cookie sent to `/mcp` still authenticates nothing; the Remote coach WebSocket still refuses a foreign `Origin`.

### Phase O2. Clients (done)

*Implemented: changeset 028 `coach_oauth_client`; `coach/oauth/` `PublicAddresses` (SSRF address policy), `RedirectUris`, `ClientMetadataFetcher` (httpclient5, guarded DNS resolver: the address checked is the address connected to), `CoachOAuthClientService` (CIMD resolve and cache, DCR, cleanup), `OAuthRegistrationController` (`POST /oauth/register`), `OAuthSecurityConfig` (the OAuth chain, `@Order(2)`, and the daily cleanup at 03:37 UTC). Tests: `PublicAddressesTest`, `RedirectUrisTest`, `ClientMetadataFetcherTest`, `CoachOAuthClientServiceTest`, `OAuthRegistrationTest`.*

*Decisions taken while building it:*
- *A DCR client id is `pmc_` + 32 hex digits. A missing `token_endpoint_auth_method` is registered as `none` (the response says so), a missing `client_name` as "Unnamed application"; a CIMD document must have a name.*
- *A CIMD document is accepted when `token_endpoint_auth_method` is absent or `none`, or when `none` is in `token_endpoint_auth_methods_supported` (ChatGPT lists several).*
- *The registration limit is per client address, 60 per hour (`coach.oauth.register.per-ip-per-hour`), in memory per instance. Hosted applications register from a few shared egress addresses, hence the generous value; both hosts prefer CIMD, which needs no registration.*
- *Behind a reverse proxy or load balancer, the client address is the proxy's unless `server.forward-headers-strategy` is set for the deployment: check it before turning OAuth on, or every registration shares one limit.*
- *`/oauth/register` answers 404 while `coach.oauth.enabled` is off.*

Build: `coach_oauth_client`; CIMD fetcher with the SSRF guard and cache (any public HTTPS host accepted); open DCR with its validation and rate limit; CORS on `/oauth/register`; daily cleanup.
Tests: CIMD accepted from any public host, cached, refreshed; refused for HTTP, redirects, private and loopback addresses (also after DNS resolution), oversize, timeout, `client_id` mismatch, missing fields; DCR accepted with HTTPS redirect URIs on any host and with loopback ones, refused for confidential methods, plain-HTTP or custom-scheme redirect URIs, more than 5, rate limit; loopback port-agnostic match for `localhost`, `127.0.0.1` and `[::1]`; unused clients deleted.

### Phase O3. Authorization and consent (done)

*Implemented: changeset 029 (`coach_oauth_request`, `coach_oauth_code`); `coach/oauth/CoachOAuthAuthorizationService`, `OAuthAuthorizeController` (`GET /oauth/authorize`, the HTML error page), `OAuthSecrets`; `controller/OAuthConsentController` for `GET /oauth/requests/{id}` and `POST /oauth/requests/{id}/decision`, declared in `openapi/api.yaml` (tag `oauth`, so the SPA client is generated); SPA page `coach/authorize` with its route, translations and the SSR headers (`no-frame.ts`: `frame-ancestors 'none'`, `X-Frame-Options: DENY`, in every language). Tests: `OAuthAuthorizationTest`, `CoachGrantTest` (all off by default), `authorize.component.spec.ts`, `no-frame.spec.ts`.*

*Decisions taken while building it:*
- *`state` is optional (echoed when sent, at most 500 characters): PKCE already protects the flow, and some clients omit it. Every redirect carries `iss`.*
- *No `scope`, or only `offline_access`, means every scope; the user can still narrow them on the consent page.*
- *The client's display data (name, verified host, loopback-only) is copied into the request, so the consent page never refetches a metadata document.*
- *A request belongs to the first logged-in user who opens it; the decision is a conditional update, so two tabs or two users cannot both decide.*
- *The consent page URL is `coach.oauth.consent-url` (default `https://www.pianoml.org/coach/authorize`). It is the English page: deep links are never redirected by language. A user who reads another language sees it in English until the app offers its language switcher there.*
- *A code is marked as completing the client's authorization (`last_used_at`), which keeps the client past the 24-hour cleanup.*

Build: `GET /oauth/authorize`, `coach_oauth_request`, the HTML error page, `GET /oauth/requests/{id}`, `POST /oauth/requests/{id}/decision`, `coach_oauth_code`; SPA consent page `/coach/authorize` (lazy, noindex, rendered in the browser, `frame-ancestors 'none'`), login round trip, translations.
Tests: every validation of 2.3 with the right outcome (page before `redirect_uri` is trusted, redirect after), `iss` and `state` on every redirect; request single use, bound to the deciding user, expiry; refusal gives `access_denied`; narrowed scopes; frontend: renders client host, redirect host and scopes, loopback warning, unverified label, login round trip, approve and refuse navigate to the returned URL.

### Phase O4. Tokens (done)

*Implemented: changeset 030 (`coach_oauth_token`, `coach_grant.client_id`); `coach/oauth/CoachOAuthTokenService`, `OAuthTokenController` (`POST /oauth/token`, `POST /oauth/revoke`); `CoachGrantService.createOAuth`; `GrantAuthenticationFilter` accepts `pmo_`; `clientHost` on the grants of `GET /account/grants` and the "Connected application" line on the account page. Tests: `OAuthTokenTest` (20), `coach-grants.component.spec.ts`.*

*Decisions taken while building it:*
- *Tokens are `pmo_` (access) and `pmr_` (refresh) followed by 32 random bytes, looked up by hash; no id part is needed.*
- *Code and refresh token single use are conditional updates: of two concurrent requests with the same value, one wins and the other is treated as a reuse (the grant is revoked), as OAuth 2.1 prescribes.*
- *A sixth connected application replaces the least recently used OAuth grant rather than failing at the token endpoint, where the user cannot be told why. Personal tokens keep their own limit of 5.*
- *Revoking a refresh token (RFC 7009) revokes the grant; revoking an access token ends that token only.*
- *A `pml_` token can never authenticate an OAuth grant (its secret hash is random and the kind is checked).*
- *`coach.oauth.enabled` stays `false` by default: every endpoint exists, but each environment turns OAuth on explicitly, staging first, for phase O5. Before that, check `server.forward-headers-strategy` (O2) and that `coach.oauth.issuer` and `coach.oauth.consent-url` match the environment.*
- *Cold-instance latency (Claude allows 10 seconds) is not measured by the tests; it is part of O5.*

Build: `POST /oauth/token` (code with PKCE and `resource`, refresh with rotation and reuse detection, 365-day absolute grant), `pmo_` access tokens, `coach_oauth_token`, `POST /oauth/revoke`, CORS on both; `GrantAuthenticationFilter` accepts `pmo_`; one live grant per (user, client); account page lists OAuth grants.
Tests: RFC 7636 test vectors; wrong verifier, wrong redirect URI, wrong client, wrong resource, missing resource bound to the canonical one, expired or reused code (the reuse revokes the grant); form-urlencoded only; refresh returns a new pair and the old token dies; a reused refresh token revokes the grant and answers `invalid_grant`; no refresh past the grant's 365 days (`invalid_grant`); a `pmo_` token works on `/mcp` with the grant's scopes, is refused when expired, revoked or of another audience; revoking on the account page kills the tokens at once; a new consent for the same client replaces the old grant; the token endpoint is usable from a browser page on another site; the endpoints answer well under 10 s on a cold instance.

### Review fixes (after O4)

*From a code review of the branch:*
- *A refresh request is fully checked (expiry, resource, grant) before its token is spent: a rejected request leaves the token usable, so a corrected retry is not taken for a reuse.*
- *`GET /oauth/authorize` is limited per client address (`coach.oauth.authorize.per-ip-per-minute`, 30), and a metadata URL that failed is not fetched again for 5 minutes (per instance, bounded), so the endpoint cannot be used to make the server fetch URLs in a loop.*
- *Token exchange and refresh record the client's use (at most once a day), so a client refreshing for months is not deleted as unused after 90 days.*
- *JSON values of the wrong type in a registration or a metadata document are refused as `invalid_client_metadata` instead of failing with a server error.*
- *Remote coach sockets cancel their hello and renewal timers when they close (`BridgeWebSocketHandler`), so dropped connections leave nothing scheduled.*

### Phase O5. Real clients, wherever they run (verification)

With a staging deployment, one client of each kind of section 2.6:

- **hosted application:** the Claude apps (custom connector by URL) and ChatGPT (developer mode connector);
- **program on the user's machine:** Claude Code (CIMD with a loopback redirect);
- **web page in the browser:** the MCP Inspector in a browser, from its own origin;
- **self-hosted harness on another domain:** a minimal client of the MCP SDK deployed on a throwaway HTTPS host, registering by DCR.

For each, record: the client identification it used, the redirect URI, whether `/mcp` requests carry an `Origin` header, the refresh behavior, and the time each endpoint took. Fix what differs from this design without special-casing a client, run an OAuth conformance tool against staging, update the coach specification and `docs/coach-mcp-setup.md` (sections "Add PianoML to an application that signs in by OAuth", with Claude and ChatGPT as examples, and "Register a client by hand" with the `curl` recipe of section 7, question 1), and check the coach prompts: `coach_start` pasted in each client calls `get_context`.

Done when all five clients connect, use the tools, survive a token refresh, and lose access when the grant is revoked on the account page.

### Phase O6 (optional). Device code

Start only when a client that supports RFC 8628 needs to connect from a machine without a reachable browser.
Build: `POST /oauth/device_authorization`, `coach_oauth_device`, the device grant on `POST /oauth/token`, `POST /oauth/device/decision`, SPA page `/device` (lazy, noindex, rendered in the browser, `frame-ancestors 'none'`, code prefilled from `?code=`, translations), the metadata and DCR changes of 2.7, daily cleanup.
Tests: codes have the right alphabet, length and lifetime, stored hashed; polling answers `authorization_pending`, `slow_down` (interval grows), `access_denied`, `expired_token`, then tokens once and never again; a poll on another instance than the approval succeeds; wrong user codes are limited per session and per IP; a code entered by one user cannot be approved by another; the grant is the same as from the code flow (365 days, rotation, revocation from the account page); frontend: login round trip, prefilled code, phishing warning, approve and refuse.
Done when a client using the device flow on a machine without a browser connects with approval from a phone, and loses access when the grant is revoked.
