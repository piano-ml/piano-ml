# PianoMl

## About PianoMl

PianoML is a project designed to help users learn piano and practice exercises.

![License](https://img.shields.io/github/license/piano-ml/piano-ml)


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

### frontend

To start a local development server, run:

```bash
npm run start
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.
Use `frontend/src/environments/environment.ts` in order to select the use of a local or a remote backend.

### backend

development require local Postgres, see `backend/src/main/resources/db/initdb.sql` for intial schema creation.
Java code known to work fine with IntelliJ, shall work on all Java Platform
