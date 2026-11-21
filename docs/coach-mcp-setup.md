# Connecting an AI assistant to PianoML (MCP)

PianoML exposes an MCP server that any MCP host (desktop assistant, coding assistant, chat application) can use to read your practice history and, in later versions, drive the player. Specification: `docs/coach-external-harness.md` (issue #414).

The quickest way is the **Connect an AI coach** page of the app (`/coach/connect`, linked from the account page): it shows the server URL, creates a token, fills configuration snippets with it, and offers ready-made prompts to paste. The user guide, with Claude, ChatGPT and other assistants, is [`coach-getting-started.md`](coach-getting-started.md). This document is the reference for developers.

## Endpoint

| | |
|---|---|
| URL | `https://api.pianoml.org/mcp` (local backend: `http://localhost:8080/mcp`) |
| Transport | Streamable HTTP, stateless (`POST` only) |
| Authentication | `Authorization: Bearer pml_...` |

Only `pml_` access tokens work on this endpoint. Your login session does not, and a `pml_` token does not work anywhere else in the API. Clients can run anywhere, a web page included: the endpoint answers any origin, with CORS and never credentials. A missing or invalid token gets `401` with a `WWW-Authenticate: Bearer` challenge.

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
| `player:control` | Opening scores and starting or stopping the player in a tab where you turned on Remote coach |

Revoke a token from the same page; it stops working at once. Tokens are also revoked when the account is deleted.

## Configure a host

Any host that lets you set the URL and an HTTP header works:

- URL: the endpoint above
- Transport: Streamable HTTP (sometimes called "HTTP")
- Header: `Authorization: Bearer <your token>`

The exact place depends on the host. Hosts that sign in by OAuth (the Claude apps, Claude Code, ChatGPT) need no token: they discover the PianoML authorization server from the `401` challenge of `/mcp`, and the user approves them on PianoML (design: `docs/coach-oauth-design.md`).

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
- Player (`player:control`, needs a PianoML tab with Remote coach on): `get_player_state`, `list_exercises`, `open_score`, `open_exercise`, `configure_practice`, `play`, `stop`, `wait_for_take_end`, `get_current_session`, `navigate`

The full descriptions are in section 4 of the specification.

## Remote coach (player tools)

The player tools run in your browser, not on the server: the assistant's call goes to the PianoML tab where you turned on **Remote coach**, and that tab answers.

1. Open PianoML, logged in, and turn on the **Remote coach** switch at the bottom right of any page (or use the **Turn on Remote coach** button of the Connect page). Confirm.
2. While it is on, the switch shows which tool controls the tab and lists what it did. Turn it off at any time; it is also off after a page reload or a logout.
3. The browser needs one click before the first sound: when the assistant starts playback for the first time, press **Start playback** in the tab.

What the assistant sees:

- `NO_ACTIVE_PLAYER`: no tab has Remote coach on; the message gives the link `https://www.pianoml.org/?remoteCoach=1`, which opens the confirmation.
- `AUDIO_LOCKED`: sound is not allowed yet; the student must press Start playback.
- `PLAYER_TIMEOUT`: the tab did not answer in time (closed, asleep, offline).

With several tabs on, the most recently focused one is controlled. The token needs the `player:control` scope.

Every result is a JSON text: `{"ok": true, "data": ...}` or `{"ok": false, "code": "...", "message": "..."}`.

## Prompts

The server offers five MCP prompts (`coach_start`, `review_progress`, `practice_piece`, `warm_up`, `find_new_piece`) for hosts that list them. The same catalog is public at `GET /coach/prompts` and shown on the Connect page, for hosts that do not. Each prompt carries the full coaching rules, so it works even where the host ignores server instructions.

## Limits

- 60 tool calls per minute per token.
- At most 5 active tokens per account, 10 created per hour.
- Each tool call is audited (time, tool, outcome, duration; never the arguments) for 3 months.
