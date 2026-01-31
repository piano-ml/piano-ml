#!/usr/bin/env python3
"""Simple chord extractor from a MusicXML URL.

Usage:
  python scripts/chordify.py <url> [--roman] [--group-by-measure] [--min-duration-quarter N]

Produces JSON array of chord events:
  [{offset_quarter, measure_number, beat, duration_quarter, figure, pitches, roman}, ...]

Requires: pip install music21 requests
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from dataclasses import dataclass, asdict
from typing import Optional

import requests

try:
    from music21 import chord, converter, harmony, roman, stream, key as m21key
except Exception as e:  # pragma: no cover
    sys.exit("music21 is required. Install with: pip install music21\n" + str(e))


@dataclass
class ChordEvent:
    offset_quarter: float
    measure_number: Optional[int]
    beat: Optional[float]
    duration_quarter: float
    figure: str
    pitches: list[str]
    roman: Optional[str] = None


def download_to_temp(url: str, timeout_seconds: int = 30) -> str:
    r = requests.get(url, stream=True, timeout=timeout_seconds)
    r.raise_for_status()

    content_type = (r.headers.get("content-type") or "").lower()
    ext = ".musicxml"
    if "mxl" in content_type or url.lower().endswith(".mxl"):
        ext = ".mxl"
    elif url.lower().endswith(".xml") or "xml" in content_type:
        ext = ".xml"

    fd, path = tempfile.mkstemp(prefix="chordify_", suffix=ext)
    os.close(fd)
    try:
        with open(path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 128):
                if chunk:
                    f.write(chunk)
    except Exception:
        try:
            os.remove(path)
        except Exception:
            pass
        raise
    return path


def first_key(score: stream.Score) -> Optional[m21key.Key]:
    ks = score.recurse().getElementsByClass(m21key.Key)
    if ks:
        return ks[0]
    try:
        return score.analyze("key")
    except Exception:
        return None


def figure_from_chord(c: chord.Chord) -> str:
    """Try music21 harmony figure first, fallback to a simple renderer."""
    try:
        fig = harmony.chordSymbolFigureFromChord(c)
        if fig:
            return fig
    except Exception:
        pass

    # Fallback: simple root + quality mapping
    try:
        cs = c.closedPosition(forceOctave=4, inPlace=False)
        cs = cs.removeRedundantPitches(inPlace=False)
        root = cs.root()
        if root is None:
            return "N"
        quality = getattr(cs, "quality", None)
        is_seventh = getattr(cs, "seventh", None) is not None
        sym = root.name
        if quality == "major":
            sym += "7" if is_seventh else ""
        elif quality == "minor":
            sym += "m7" if is_seventh else "m"
        elif quality == "diminished":
            sym += "dim" if not is_seventh else "m7b5"
        elif quality == "augmented":
            sym += "+7" if is_seventh else "+"
        return sym
    except Exception:
        try:
            return c.root().name  # type: ignore[attr-defined]
        except Exception:
            return "N"


def extract_chords_from_score(score: stream.Score, *, roman_numerals: bool = False,
                              simplify: bool = True, min_duration_quarter: float = 0.0,
                              group_by_measure: bool = False) -> list[ChordEvent]:
    ch = score.chordify()
    detected_key = first_key(score) if roman_numerals else None

    events: list[ChordEvent] = []
    last_fig: Optional[str] = None
    last_measure: Optional[int] = None

    for c in ch.recurse().getElementsByClass(chord.Chord):
        if c.isRest:
            continue
        dur = float(getattr(c.duration, "quarterLength", 0.0))
        if dur <= 0 or dur < min_duration_quarter:
            continue

        fig = figure_from_chord(c) if simplify else figure_from_chord(c)
        if fig == "N":
            continue

        m = getattr(c, "measureNumber", None)
        beat = None
        try:
            beat = float(getattr(c, "beat", None)) if getattr(c, "beat", None) is not None else None
        except Exception:
            beat = None

        rn = None
        if roman_numerals and detected_key is not None:
            try:
                rn_obj = roman.romanNumeralFromChord(c, detected_key)
                rn = getattr(rn_obj, "figure", None)
            except Exception:
                rn = None

        if group_by_measure and m == last_measure:
            continue
        if fig == last_fig and (not group_by_measure):
            continue

        events.append(ChordEvent(
            offset_quarter=float(getattr(c, "offset", 0.0)),
            measure_number=int(m) if m is not None else None,
            beat=beat,
            duration_quarter=dur,
            figure=fig,
            pitches=[p.nameWithOctave for p in c.pitches],
            roman=rn,
        ))
        last_fig = fig
        last_measure = m

    return events


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Extract chords from a MusicXML URL")
    parser.add_argument("url", help="URL to MusicXML or MXL file")
    parser.add_argument("--roman", action="store_true", help="Include roman numerals")
    parser.add_argument("--group-by-measure", action="store_true", help="Keep one chord per measure")
    parser.add_argument("--min-duration-quarter", type=float, default=0.0, help="Minimum duration (quarters) to keep")
    parser.add_argument("--timeout", type=int, default=30, help="Download timeout seconds")
    args = parser.parse_args(argv)

    path = None
    try:
        path = download_to_temp(args.url, timeout_seconds=args.timeout)
        score = converter.parse(path)
        events = extract_chords_from_score(
            score,
            roman_numerals=args.roman,
            simplify=True,
            min_duration_quarter=args.min_duration_quarter,
            group_by_measure=args.group_by_measure,
        )
        out = [asdict(e) for e in events]
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 0
    except Exception as e:  # pragma: no cover
        print(f"Error: {e}", file=sys.stderr)
        return 2
    finally:
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except Exception:
                pass


if __name__ == "__main__":
    sys.exit(main())

