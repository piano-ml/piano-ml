import sys
import json
from music21 import converter, metadata, tempo
from collections import defaultdict

def extract_predominant_tempo(score):
    """
    Extract the predominant tempo from the score based on duration coverage.
    Returns the tempo that covers the most duration in the piece.
    """
    # Get all tempo markings with their positions
    tempo_markings = []

    # Check all parts for tempo markings
    for part in score.parts:
        for element in part.recurse():
            if isinstance(element, (tempo.TempoIndication, tempo.MetronomeMark)):
                offset = element.offset
                if hasattr(element, 'number') and element.number:
                    bpm = element.number
                elif hasattr(element, 'getQuarterBPM'):
                    bpm = element.getQuarterBPM()
                else:
                    continue
                tempo_markings.append((offset, bpm))

    # If no tempo markings found, try to get default tempo
    if not tempo_markings:
        try:
            # Try to get tempo from metronome mark boundaries
            boundaries = score.metronomeMarkBoundaries()
            if boundaries:
                return int(boundaries[0][2].getQuarterBPM())
        except:
            pass
        return None

    # Sort tempo markings by offset
    tempo_markings.sort(key=lambda x: x[0])

    # Calculate duration coverage for each tempo
    tempo_durations = defaultdict(float)
    total_duration = float(score.duration.quarterLength)

    for i, (offset, bpm) in enumerate(tempo_markings):
        # Calculate the duration this tempo is active
        if i + 1 < len(tempo_markings):
            duration = tempo_markings[i + 1][0] - offset
        else:
            # Last tempo marking lasts until the end
            duration = total_duration - offset

        tempo_durations[bpm] += duration

    # Find the tempo with the longest duration
    if tempo_durations:
        predominant_tempo = max(tempo_durations.items(), key=lambda x: x[1])
        return int(predominant_tempo[0])

    return None

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
