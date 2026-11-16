# Connecting an AI assistant to PianoML (MCP)

PianoML exposes an MCP server that any MCP host (desktop assistant, coding assistant, chat application) can use to read your practice history and, in later versions, drive the player. Specification: `docs/coach-external-harness.md` (issue #414).

The quickest way is the **Connect an AI coach** page of the app (`/coach/connect`, linked from the account page): it shows the server URL, creates a token, fills configuration snippets with it, and offers ready-made prompts to paste. This document is the reference for developers.

## Endpoint

| | |
|---|---|
| URL | `https://api.pianoml.org/mcp` (local backend: `http://localhost:8080/mcp`) |
| Transport | Streamable HTTP, stateless (`POST` only) |
| Authentication | `Authorization: Bearer pml_...` |

Only `pml_` access tokens work on this endpoint. Your login session does not, and a `pml_` token does not work anywhere else in the API. A request carrying an `Origin` header (a web page) is refused unless the origin is listed in the backend property `coach.mcp.allowed-origins`.

## Create a token

1. Log in to PianoML and open your account page.
2. In **Access for external tools**, choose **New access**.
3. Name it after the tool, pick what it may do, and choose an expiry.
4. Copy the token. It is shown once.

Scopes:

| Scope | Allows |
|---|---|
| `practice:read` | Practice history, accuracy, streaks, level |
| `scores:read` | Searching and reading the score library |
| `player:control` | Opening scores and starting or stopping the player in a tab where you turned on Remote coach (not available yet) |

Revoke a token from the same page; it stops working at once. Tokens are also revoked when the account is deleted.

## Configure a host

Any host that lets you set the URL and an HTTP header works:

- URL: the endpoint above
- Transport: Streamable HTTP (sometimes called "HTTP")
- Header: `Authorization: Bearer <your token>`

The exact place depends on the host. Hosts that only accept OAuth connections cannot connect yet.

## Try it without an assistant

List the tools:

```bash
curl -s https://api.pianoml.org/mcp \
  -H "Authorization: Bearer $PIANOML_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Call one:

```bash
curl -s https://api.pianoml.org/mcp \
  -H "Authorization: Bearer $PIANOML_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_context","arguments":{}}}'
```

The MCP Inspector (`npx @modelcontextprotocol/inspector`) can also connect: choose the Streamable HTTP transport, enter the URL and add the `Authorization` header.

## Tools available now

- Context: `get_context`
- Practice (`practice:read`): `get_practice_summary`, `get_practice_calendar`, `list_practiced_items`, `get_item_progress`, `get_weak_spots`, `get_key_stats`, `get_practice_sessions`, `get_practice_session`
- Library (`scores:read`): `search_scores`, `get_score`, `get_score_harmony`, `get_score_videos`, `list_my_scores`, `list_composers`, `search_composers`, `get_composer`, `list_genres`, `list_keys`
- Both: `recommend_scores`

Player tools come in a later phase; the full list is in section 4 of the specification.

Every result is a JSON text: `{"ok": true, "data": ...}` or `{"ok": false, "code": "...", "message": "..."}`.

## Prompts

The server offers five MCP prompts (`coach_start`, `review_progress`, `practice_piece`, `warm_up`, `find_new_piece`) for hosts that list them. The same catalog is public at `GET /coach/prompts` and shown on the Connect page, for hosts that do not. Each prompt carries the full coaching rules, so it works even where the host ignores server instructions.

## Limits

- 60 tool calls per minute per token.
- At most 5 active tokens per account, 10 created per hour.
- Each tool call is audited (time, tool, outcome, duration; never the arguments) for 3 months.
