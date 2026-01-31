#!/usr/bin/env python3
"""Extract chord progression from a MusicXML URL.

- Downloads the MusicXML file
- Parses it with music21
- Chordifies the score
- Extracts a cleaned chord progression (symbol + optional roman numeral)

Requires:
  pip install music21 requests

Example:
  python scripts/extract_chord_progression.py \
    "https://api.pianoml.org/score/.../musicxml/2/1" \
    --roman --group-by-measure
"""

from __future__ import annotations

import argparse
import json
import math
import os
from dataclasses import dataclass, asdict
from typing import Any, Iterable, Optional

import requests

try:
    from music21 import chord, converter, roman, stream, key as m21key
except Exception as e:  # pragma: no cover
    raise SystemExit(
        "music21 is required. Install with: pip install music21\n"
        f"Import error: {e}"
    )


@dataclass
class ChordEvent:
    offset_quarter: float
    measure_number: Optional[int]
    beat: Optional[float]
    duration_quarter: float
    figure: str
    pitches: list[str]
    roman: Optional[str] = None


def _download_to_temp(url: str, timeout_seconds: int = 30) -> str:
    # Stream to avoid loading large data fully in memory.
    r = requests.get(url, stream=True, timeout=timeout_seconds)
    r.raise_for_status()

    # Guess extension for readability; music21 can parse either xml/mxl.
    content_type = (r.headers.get("content-type") or "").lower()
    ext = ".musicxml"
    if "mxl" in content_type or url.lower().endswith(".mxl"):
        ext = ".mxl"
    elif url.lower().endswith(".xml") or "xml" in content_type:
        ext = ".xml"

    fd, path = tempfile.mkstemp(prefix="pianoml_musicxml_", suffix=ext)
    os.close(fd)

    with open(path, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 128):
            if chunk:
                f.write(chunk)
    return path


def _first_key(score: stream.Score) -> Optional[m21key.Key]:
    # Try explicit key signatures first.
    ks = score.recurse().getElementsByClass(m21key.Key)
    if ks:
        return ks[0]

    # Fallback to analysis.
    try:
        return score.analyze("key")
    except Exception:
        return None


def _clean_figure(c: chord.Chord, simplify: bool = True) -> str:
    # Prefer music21's commonName or pitchedCommonName? Those are verbose.
    # We want typical lead-sheet-ish symbols.
    # music21 has .pitchedCommonName and .commonName; .figure is for RomanNumeral.
    try:
        if simplify:
            # Reduce to triad/seventh; keep inversion out.
            cs = c.closedPosition(forceOctave=4, inPlace=False)
            cs = cs.removeRedundantPitches(inPlace=False)
        else:
            cs = c

        root = cs.root()
        if root is None:
            return "N"  # no chord

        quality = cs.quality  # 'major', 'minor', 'diminished', 'augmented', etc.
        is_seventh = cs.seventh is not None

        # Map qualities to symbols.
        # Keep this conservative.
        sym = root.name
        if quality == "major":
            sym += "" if not is_seventh else "7"
        elif quality == "minor":
            sym += "m" if not is_seventh else "m7"
        elif quality == "diminished":
            sym += "dim" if not is_seventh else "m7b5"  # closest common symbol
        elif quality == "augmented":
            sym += "+" if not is_seventh else "+7"
        else:
        else:
            # Fallback: write root plus pitch classes.
            sym += "(" + ",".join(p.name for p in cs.pitches) + ")"
        return sym
    except Exception:
        # Very defensive: never crash extraction.
        try:
            return c.root().name  # type: ignore[union-attr]
        except Exception:
            return "N"


def extract_chord_events(
    score: stream.Score,
    *,
    roman_numerals: bool = False,
    simplify: bool = True,
    min_duration_quarter: float = 0.0,
    group_by_measure: bool = False,
) -> list[ChordEvent]:
    # Chordify reduces polyphony to vertical sonorities.
    ch: stream.Part = score.chordify()

    detected_key = _first_key(score) if roman_numerals else None

    events: list[ChordEvent] = []

    last_figure: Optional[str] = None
    last_measure: Optional[int] = None

    for el in ch.recurse().notesAndRests:
        if el.isRest:
            continue

        if not isinstance(el, chord.Chord):
            continue

        dur = float(el.duration.quarterLength)
        if dur <= 0 or dur < min_duration_quarter:
            continue

        fig = _clean_figure(el, simplify=simplify)
        if fig == "N":
            continue

        m = el.measureNumber
        b = None
        try:
            b = float(el.beat)
        except Exception:
            b = None

        rn = None
        if roman_numerals and detected_key is not None:
            try:
                rn_obj = roman.romanNumeralFromChord(el, detected_key)
                # Keep a compact figure like V7, iiø7, etc.
                rn = rn_obj.figure
            except Exception:
                rn = None

        # Optional grouping: keep only first chord per measure (simple browse use-case).
        if group_by_measure:
            if m == last_measure:
                continue

        # De-duplicate consecutive identical figures.
        if fig == last_figure and (not group_by_measure):
            continue

        events.append(
            ChordEvent(
                offset_quarter=float(el.offset),
                measure_number=int(m) if m is not None else None,
                beat=b,
                duration_quarter=dur,
                figure=fig,
                pitches=[p.nameWithOctave for p in el.pitches],
                roman=rn,
            )
        )
        last_figure = fig
        last_measure = m

    return events


def main(argv: Optional[list[str]] = None) -> int:
