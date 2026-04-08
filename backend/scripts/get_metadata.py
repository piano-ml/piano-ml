import sys
import json
import subprocess
import os
from music21 import converter, metadata, tempo, analysis, harmony
from collections import defaultdict

def extract_predominant_tempo(score):
    """
    Calcule le tempo moyen de la partition et retourne la valeur moyenne (BPM).
    """
    from music21 import tempo, stream
    tempos = []
    # Collecte tous les tempos
    for part in score.parts:
        for element in part.recurse():
            if isinstance(element, (tempo.TempoIndication, tempo.MetronomeMark)):
                if hasattr(element, 'number') and element.number:
                    bpm = element.number
                elif hasattr(element, 'getQuarterBPM'):
                    bpm = element.getQuarterBPM()
                else:
                    continue
                tempos.append(bpm)
    # Si aucun tempo trouvé, valeur par défaut
    if not tempos:
        avg_tempo = 120
    else:
        avg_tempo = sum(tempos) / len(tempos)
    # Note: nous ne supprimons pas explicitement les marquages ici (inutile pour la métadata)
    return avg_tempo

def extract_harmony(score):
    """Extract harmony from a parsed score and return a list of harmony dicts."""
    results = []

    for element in score.recurse():
        if isinstance(element, harmony.ChordSymbol):
            measure = element.measureNumber
            root_name = element.root().name if element.root() else None
            kind = element.chordKind if element.chordKind else None

            entry = {"measure": measure}

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

def analyze(score):
    """
    Analyse la tonalité du score et retourne un dict contenant:
      - tonic: nom de la tonique (ou None)
      - mode: 'major' / 'minor' (ou None)
      - full_key: représentation complète de la clé (string) ou None
      - certainty: score de confiance (float) ou None
    """
    try:
        key_result = score.analyze('key')  # utilise Krumhansl-Schmuckler par défaut
    except Exception:
        return {"tonic": None, "mode": None, "full_key": None, "certainty": None}

    # tonic
    tonic_name = None
    try:
        tonic = getattr(key_result, 'tonic', None)
        tonic_name = tonic.name if tonic is not None else None
    except Exception:
        tonic_name = None

    # mode
    try:
        mode = getattr(key_result, 'mode', None)
    except Exception:
        mode = None

    # full key string
    try:
        full_key = str(key_result)
    except Exception:
        full_key = None

    # certainty
    certainty = None
    try:
        if hasattr(key_result, 'tonalCertainty'):
            val = key_result.tonalCertainty()
            certainty = float(val) if val is not None else None
    except Exception:
        certainty = None

    return {
        "tonic": tonic_name,
        "mode": mode,
        "full_key": full_key,
        "certainty": certainty
    }

def extract_grade(midifile: str) -> float | None:
    """
    Run inference.py on the given MIDI file and return the predicted grade
    as a float (result["predicted_value"]), or None on failure.
    """
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    classifier_dir = os.path.join(scripts_dir, "..", "piano-syllabus-classifier")
    inference_script = os.path.join(classifier_dir, "inference.py")
    model_dir = os.path.join(classifier_dir, "ps_model")

    try:
        proc = subprocess.run(
            [sys.executable, inference_script, "--midi_file", midifile, "--model_dir", model_dir],
            capture_output=True,
            text=True,
            cwd=classifier_dir,
        )
        if proc.returncode != 0:
            print(f"[extract_grade] inference.py failed (rc={proc.returncode})")
            print(f"[extract_grade] stdout: {proc.stdout.strip()}")
            print(f"[extract_grade] stderr: {proc.stderr.strip()}")
            return None
        # inference.py prints the result dict via print(f"{result}")
        output = proc.stdout.strip()
        result = eval(output)
        return float(result["predicted_value"])
    except Exception as e:
        print(f"[extract_grade] exception: {e}")
        print(f"[extract_grade] stdout: {proc.stdout.strip() if 'proc' in dir() else 'N/A'}")
        print(f"[extract_grade] stderr: {proc.stderr.strip() if 'proc' in dir() else 'N/A'}")
        return None


def main():
    if len(sys.argv) != 2:
        print("Usage: python get_metadata.py <midifile>")
        sys.exit(1)

    midifile = sys.argv[1]
    score = converter.parse(midifile)
    analysis = analyze(score)

    # Extract tempo
    predominant_tempo = extract_predominant_tempo(score)

    # Calculate other metadata
    try:
        boundaries = score.metronomeMarkBoundaries()
        if boundaries:
            duration_seconds = score.duration.quarterLength * boundaries[0][2].secondsPerQuarter()
        else:
            # Fallback calculation with default tempo (120 BPM)
            duration_seconds = score.duration.quarterLength * (60.0 / 120.0)
    except:
        # Fallback calculation
        duration_seconds = score.duration.quarterLength * 0.5  # Assume 120 BPM

    measures_count = 0
    if score.parts:
        measures_count = len(list(score.parts[0].getElementsByClass('Measure')))

    has_lyrics = False
    if score.parts:
        for part in score.parts:
            if any(hasattr(n, 'lyric') and n.lyric is not None for n in part.recurse().notes):
                has_lyrics = True
                break

    metadata_dict = {
        "tracks_count": len(score.parts),
        "duration_seconds": duration_seconds,
        "measures_count": measures_count,
        "has_lyrics": has_lyrics,
        "tempo": predominant_tempo,
        "grade": extract_grade(midifile.replace(".musicxml", ".midi")),
        "analysis": analysis,
        "harmony": extract_harmony(score)
    }

    with open("metadata.json", "w") as f:
        json.dump(metadata_dict, f, indent=2)

if __name__ == "__main__":
    main()
