# PianoMl

## About PianoMl

PianoML is a project designed to help users learn piano and practice exercises.

![License](https://img.shields.io/github/license/piano-ml/piano-ml)
[![Backend coverage](https://raw.githubusercontent.com/piano-ml/piano-ml/badges/develop/backend.svg)](https://github.com/piano-ml/piano-ml/actions/workflows/build.yaml?query=branch%3Adevelop)
[![Frontend coverage](https://raw.githubusercontent.com/piano-ml/piano-ml/badges/develop/frontend.svg)](https://github.com/piano-ml/piano-ml/actions/workflows/build.yaml?query=branch%3Adevelop)


## Features

- Midi keyboard integration
- Scales, chords and Arpeggios exercises
- Load any MusicXML, Midi or Karaoke file
- Load PDF or Image files through Optical Music Recognition (OMR)
- Score engraving
- Integrated with Musicbrainz author and Score thesaurus
- Select track and split hands
- Automatically grade (0/8) score with handcrafted feature Machine Learning model
- auto harmonization
- Real-time feedback
- Open-source and community-driven

## Getting Started

Visit our [official website](https://www.pianoml.org) to learn more and get started.

## Development server

### Prerequisites

| Tool | Version | Used by |
|---|---|---|
| Node.js | ≥ 22.22.3 (or ≥ 24.15.0, or ≥ 26.0.0); CI uses 26.13.0 | frontend (Angular 22) |
| JDK | 25 | backend (Spring Boot 4) |
| Maven | 3.9+ | backend build |
| PostgreSQL | 14 or newer recommended (Hibernate 7 no longer supports 13) | backend database |

Check your versions with `node -v` and `java -version`. One way to install them:

```bash
# Node.js 26 LTS (Debian/Ubuntu, NodeSource)
curl -fsSL https://deb.nodesource.com/setup_26.x | sudo bash - && sudo apt install -y nodejs

# JDK 25 (SDKMAN, Temurin, the same distribution CI uses)
sdk install java 25.0.5.0+8-tem
```

The frontend unit tests (`npm test`) run with Vitest in headless Chromium. Install the browser once, from `frontend/`, with `npx playwright install chromium`.

### frontend

To start a local development server, run:

```bash
npm run start
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

The frontend always reaches the API through the dev-server proxy (`frontend/proxy.conf.mjs`), at `/api`:

| Backend | Command |
|---|---|
| Remote (`https://api.pianoml.org`, default) | `npm run start` |
| Local (`http://localhost:8080`) | `API_TARGET=http://localhost:8080 npm run start` |

`ng serve` listens on `localhost` only; to use `http://127.0.0.1:4200/`, start it with `npm run start -- --host 127.0.0.1`.

For the browser every call is same-origin, which is what the API's security model requires: the auth cookie is `HttpOnly; Secure; SameSite=Strict`, CORS does not allow `localhost`, and CSRF protection needs the frontend to read the `XSRF-TOKEN` cookie. The proxy strips the `Origin` header and adapts cookies to plain http (drops `Secure` and production-only `Domain` cookies). Pointing `environment.api` at an absolute API URL from localhost is not supported: login and every write request would fail.

#### Languages

The site is built once per language (Angular i18n): English at `/`, every other language under its own prefix (`/es/`, `/fr/`, `/zh/`…) with the same paths. The list lives only in the `i18n` section of `frontend/angular.json`; the language menu, `hreflang` links, web app manifests, sitemap, `robots.txt` and the `/` redirect are all derived from it.

`npm run start` builds one language at a time, so on `http://localhost:4200/` only English exists: the language menu's other links (`/fr/`…) return 404 there. To work on another language, serve it under its prefix with `npm run start -- -c fr` (the configuration is the language code, e.g. `-c zh-Hans`), then open `http://localhost:4200/fr/`. To see every language at once, build and serve production (`npm run build`, then `node dist/piano-ml/server/server.mjs` on `http://localhost:4000/`).

- Mark new text with `i18n="@@area.key"` in templates or `` $localize`:@@area.key:Text` `` in TypeScript.
- `npm run i18n:check` fails when a message is missing, untranslated or stale in a `messages.<code>.xlf` (CI runs it); `npm run i18n:check -- --fix` adds the new units to every file, then translate their `<target>`.
- To add a language: add `"<code>": { "translation": "src/locale/messages.<code>.xlf", "subPath": "<prefix>" }` under `i18n.locales`, run `npm run i18n:check -- --fix` (it also writes that language's `ng serve` configuration), translate the new file, and rebuild.

### backend

development require local Postgres, see `backend/src/main/resources/db/initdb.sql` for intial schema creation.
Java code known to work fine with IntelliJ, and should work with any IDE that supports JDK 25.
