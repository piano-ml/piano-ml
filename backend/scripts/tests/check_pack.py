"""Checks a midi2pack.sh zip: which tracks ended up in the score, in which order, and that its MIDI is the upload.

Usage: python check_pack.py <zip> <expected_parts> <uploaded_midi>

Tracks are recognized by the pitches make_test_midis.py gives them:
  RH = C5..G5, LH = C3..G3, ST (strings) = G4..D5, DR (drums) = unpitched.
expected_parts: score parts top to bottom, comma separated; "RH+LH" is one part holding both hands
                (e.g. "RH,LH", "ST", "RH+LH").
uploaded_midi: the file given to midi2pack.sh. The zip's MIDI must be identical: the player plays all of it and
               finds the study tracks in it by the numbers the import page showed for the upload.
"""
import sys
import xml.etree.ElementTree as ET
import zipfile


def label(pitches, unpitched):
    found = []
    if pitches & {"E5", "F5", "G5"}:
        found.append("RH")
    if any(p.endswith("3") for p in pitches):
        found.append("LH")
    if pitches & {"A4", "B4"}:
        found.append("ST")
    if unpitched:
        found.append("DR")
    return "+".join(found) or "?"


def score_parts(xml_bytes):
    root = ET.fromstring(xml_bytes)
    parts = []
    for part in root.findall("part"):
        pitches = {n.findtext("pitch/step") + n.findtext("pitch/octave") for n in part.iter("note") if n.find("pitch") is not None}
        unpitched = any(n.find("unpitched") is not None for n in part.iter("note"))
        parts.append(label(pitches, unpitched))
    return parts


def main(zip_path, expected_parts, uploaded_midi):
    with zipfile.ZipFile(zip_path) as z:
        names = z.namelist()
        xml = next((n for n in names if n.endswith(".musicxml")), None)
        midi = next((n for n in names if n.endswith(".midi")), None)
        errors = []
        for wanted in (".pdf", ".midi", ".musicxml", "metadata.json"):
            if not any(n.endswith(wanted) for n in names):
                errors.append(f"zip has no {wanted} ({names})")
        if xml:
            parts = ",".join(score_parts(z.read(xml)))
            if parts != expected_parts:
                errors.append(f"score parts {parts}, expected {expected_parts}")
        if midi:
            with open(uploaded_midi, "rb") as f:
                if z.read(midi) != f.read():
                    errors.append("the zip's MIDI is not the uploaded file")
    for e in errors:
        print("  -", e)
    return 1 if errors else 0


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(*sys.argv[1:]))
