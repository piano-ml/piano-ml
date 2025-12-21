import sys
import json
from music21 import converter, metadata, tempo, analysis
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
        "analysis": analysis
    }

    print(metadata_dict)
    with open("metadata.json", "w") as f:
        json.dump(metadata_dict, f, indent=2)

if __name__ == "__main__":
    main()
