import argparse
import os
from music21 import converter, midi

def process_mxl_file(input_file, output_file, verbose):
    try:
        if verbose:
            print(f"Processing: {input_file}")
        # Load the MusicXML file
        score = converter.parse(input_file)

        # Initialize a MIDI stream for combining parts
        combined_midi = midi.MidiFile()

        # Add each part to the combined MIDI stream
        for part in score.parts:
            mf = midi.translate.streamToMidiFile(part)
            for track in mf.tracks:
                combined_midi.tracks.append(track)

        # Write the combined MIDI stream to the output file
        combined_midi.open(output_file, 'wb')
        combined_midi.write()
        combined_midi.close()

        if verbose:
            print(f"MIDI file written to: {output_file}")

    except Exception as e:
        print(f"Error processing {input_file}: {e}")

def main():
    parser = argparse.ArgumentParser(
        description="Convert a single MusicXML file to a MIDI file."
    )
    parser.add_argument("file_in", type=str, help="Input MusicXML file")
    parser.add_argument("file_out", type=str, help="Output MIDI file")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose output")
    args = parser.parse_args()

    file_in_abs = os.path.abspath(args.file_in)
    file_out_abs = os.path.abspath(args.file_out)

    if args.verbose:
        print(f"Input File: {file_in_abs}")
        print(f"Output File: {file_out_abs}")

    supported_extensions = (".musicxml", ".xml", ".mxl")
    if not file_in_abs.lower().endswith(supported_extensions):
        print("Error: Unsupported input file format.")
        sys.exit(1)

    process_mxl_file(file_in_abs, file_out_abs, args.verbose)

if __name__ == "__main__":
    main()
