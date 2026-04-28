import sys
import json
from collections import Counter

# Pour le chiffrage romain
from pytheory import Key


def extract_patterns(chords, bar_lengths=(4, 8, 16, 32)):
    patterns = {l: Counter() for l in bar_lengths}
    n = len(chords)
    for l in bar_lengths:
        for i in range(n - l + 1):
            pat = tuple(chords[i:i+l])
            patterns[l][pat] += 1
    return patterns


def main():
    if len(sys.argv) < 4:
        print("Usage: python extract_chord_progression.py <input.json> <tonic> <mode>")
        print("Exemple: python extract_chord_progression.py file.json G minor")
        sys.exit(1)
    input_file = sys.argv[1]
    tonic = sys.argv[2]
    mode = sys.argv[3]
    with open(input_file, 'r') as f:
        data = json.load(f)
    # On travaille uniquement sur les noms d'accords
    # Conversion pour tonal.js
    kind_map = {
        "major-seventh": "maj7",
        "minor-seventh": "m7",
        "dominant-seventh": "7",
        "half-diminished-seventh": "m7b5",
        "diminished-seventh": "dim7",
        "dominant-ninth": "9",
        # Ajouter d'autres mappings si besoin
    }
    chords = []
    for d in data:
        root = d["root"]
        kind = d.get("kind", "")
        suffix = kind_map.get(kind, "")
        chords.append(root + suffix)

    patterns = extract_patterns(chords)

    # Initialiser la clé pytheory
    try:
        key = Key(tonic, mode)
    except Exception as e:
        key = None

    import re
    from pytheory._statics import int2roman
    def chord_to_roman(chord_name):
        if not key:
            return "?"
        m = re.match(r"([A-G][b#]?)(?: \(([^)]*)\))?", chord_name)
        if not m:
            return "?"
        root = m.group(1)
        kind = m.group(2) or ""
        mapping = {
            "major-seventh": "maj7",
            "minor-seventh": "m7",
            "dominant-seventh": "7",
            "half-diminished-seventh": "m7b5",
            "diminished-seventh": "dim7",
            "dominant-ninth": "9",
        }
        suffix = mapping.get(kind, "")
        try:
            note_names = key.note_names
            if root in note_names:
                degree = note_names.index(root)
                roman = int2roman(degree + 1)
                if "minor" in kind or "diminished" in kind or "half-diminished" in kind:
                    roman = roman.lower()
                if "seventh" in kind:
                    roman += "7"
                elif "ninth" in kind:
                    roman += "9"
                elif "major-seventh" in kind:
                    roman += "maj7"
                return roman
            else:
                return f"?({root})"
        except Exception:
            return "?"

    result = {
        "key": f"{tonic} {mode}",
        "progressions": {}
    }
    for l in (4, 8, 16, 32):
        found = False
        for pat, count in patterns[l].most_common():
            if count > 1:
                result["progressions"][str(l)] = {
                    "chords": list(pat),
                    "roman": [chord_to_roman(c) for c in pat],
                    "count": count
                }
                found = True
                break
        if not found:
            result["progressions"][str(l)] = None

    print(json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
