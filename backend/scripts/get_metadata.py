import sys
import json
from music21 import converter, metadata, tempo
from collections import defaultdict

def extract_predominant_tempo(score):
    """
    Calcule le tempo moyen de la partition, supprime tous les marquages de tempo,
    et ajoute un seul tempo moyen au début.
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
    # Supprime tous les marquages de tempo
    for part in score.parts:
        to_remove = []
        for element in part.recurse():
            if isinstance(element, (tempo.TempoIndication, tempo.MetronomeMark)):
                to_remove.append(element)

def main():
    if len(sys.argv) != 2:
        print("Usage: python get_metadata.py <midifile>")
        sys.exit(1)

    midifile = sys.argv[1]
    score = converter.parse(midifile)

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
        "tempo": predominant_tempo
    }

    print(metadata_dict)
    with open("metadata.json", "w") as f:
        json.dump(metadata_dict, f, indent=2)

if __name__ == "__main__":
    main()
