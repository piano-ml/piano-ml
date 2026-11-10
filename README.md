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
Use `frontend/src/environments/environment.ts` in order to select the use of a local or a remote backend.

### backend

development require local Postgres, see `backend/src/main/resources/db/initdb.sql` for intial schema creation.
Java code known to work fine with IntelliJ, and should work with any IDE that supports JDK 25.
