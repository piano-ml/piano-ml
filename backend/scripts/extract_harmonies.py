#!/usr/bin/env python3
"""
Extract harmony from a MusicXML file and output them as JSON.

Usage:
    python extract_harmony.py <musicxml_file> [--output <output_file>]

Output format:
    [
        {"measure": 1, "root": "D", "kind": "dominant"},
        {"measure": 2, "root": "G", "kind": "major"},
        ...
    ]

If a root has an alteration (e.g. sharp/flat), it is appended to the root name:
    - sharp  -> "#"
    - flat   -> "b"
    e.g. {"measure": 5, "root": "Bb", "kind": "minor"}

If there are multiple harmony in the same measure, each one produces a separate entry
with an additional "beat" field indicating position within the measure.
"""

import argparse
import json
import sys

from music21 import converter, harmony


def extract_harmony(musicxml_path: str) -> list[dict]:
    """Parse a MusicXML file and return a list of harmony dicts."""
    score = converter.parse(musicxml_path)

    results = []

    for element in score.recurse():
        if isinstance(element, harmony.ChordSymbol):
            measure = element.measureNumber
            root_name = element.root().name if element.root() else None
            kind = element.chordKind if element.chordKind else None

            entry: dict = {"measure": measure}

            if root_name is not None:
                # music21 uses '-' for flat, normalize to 'b'
                entry["root"] = root_name.replace("-", "b")
            else:
                entry["root"] = None

            entry["kind"] = kind

            # Include beat position if useful (especially when multiple harmony per measure)
            beat = element.beat
            if beat is not None:
                entry["beat"] = float(beat)

            # Include bass note if different from root
            if element.bass() and element.bass().name != (element.root().name if element.root() else None):
                entry["bass"] = element.bass().name.replace("-", "b")

            results.append(entry)

    return results


def main():
    parser = argparse.ArgumentParser(
        description="Extract harmony from a MusicXML file as JSON."
    )
    parser.add_argument("musicxml", help="Path to the MusicXML file")
    parser.add_argument(
        "-o", "--output",
        help="Output JSON file path (defaults to stdout)",
        default=None,
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print the JSON output",
    )

    args = parser.parse_args()

    try:
        harmony = extract_harmony(args.musicxml)
    except Exception as e:
        print(f"Error parsing MusicXML file: {e}", file=sys.stderr)
        sys.exit(1)

    indent = 2 if args.pretty else None
    json_output = json.dumps(harmony, indent=indent, ensure_ascii=False)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(json_output)
            f.write("\n")
        print(f"Wrote {len(harmony)} harmony to {args.output}", file=sys.stderr)
    else:
        print(json_output)


if __name__ == "__main__":
    main()

