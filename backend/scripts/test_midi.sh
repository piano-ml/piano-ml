#!/bin/bash
# Local test of midi2pack.sh with MIDI files of 1, 2 and more tracks (needs musescore3 and ~/shared-venv,
# like the script itself; not run in CI).
#
#   backend/scripts/test_midi.sh            all cases
#   backend/scripts/test_midi.sh four       only the cases whose name contains "four"
#
# Each case copies a generated MIDI file (tests/make_test_midis.py) to a temp dir as upload_<case>.midi, like
# PackService, runs midi2pack.sh with the track numbers the import page would send (@tonejs/midi's numbering),
# then checks the zip (tests/check_pack.py):
#   - the score (musicxml) holds exactly the chosen tracks, in the file's order;
#   - the MIDI is the uploaded file, byte for byte: the player plays every track of it.
# Expected exit: 0, or "fail" when the script must refuse the arguments.
set -uo pipefail

SCRIPTS_DIR=$(dirname "$(realpath "$0")")
BACKEND_DIR=$(dirname "$SCRIPTS_DIR")
PYTHON=~/shared-venv/bin/python
FILTER="${1:-}"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

"$PYTHON" "$SCRIPTS_DIR/tests/make_test_midis.py" "$WORK/assets" > /dev/null || exit 1

PASSED=0
FAILED=()

# run_case <name> <asset> <expected exit> <expected score parts> <TRACK_RIGHT> [TRACK_LEFT]
run_case() {
  local name="$1" asset="$2" want_exit="$3" want_parts="$4"
  shift 4
  [[ -n "$FILTER" && "$name" != *"$FILTER"* ]] && return
  local dir="$WORK/$name"
  mkdir -p "$dir"
  cp "$WORK/assets/$asset" "$dir/upload_$name.midi"
  printf '%-40s ' "$name"
  (cd "$BACKEND_DIR" && ./scripts/midi2pack.sh "$dir/upload_$name.midi" "Test $name" "Test Composer" false "$@") > "$dir/log" 2>&1
  local code=$?
  local leftovers
  leftovers=$(find "$dir" -mindepth 1 ! -name log ! -name "$name.zip")
  local errors=""
  if [[ "$want_exit" == "fail" ]]; then
    [[ $code -eq 0 ]] && errors+="  - exit 0, expected a failure"$'\n'
  elif [[ $code -ne 0 ]]; then
    errors+="  - exit $code:"$'\n'"$(tail -5 "$dir/log" | sed 's/^/      /')"$'\n'
  elif [[ ! -f "$dir/$name.zip" ]]; then
    errors+="  - no $name.zip"$'\n'
  else
    errors+=$("$PYTHON" "$SCRIPTS_DIR/tests/check_pack.py" "$dir/$name.zip" "$want_parts" "$WORK/assets/$asset")
  fi
  [[ -n "$leftovers" ]] && errors+="  - files left behind: $leftovers"$'\n'
  if [[ -z "$errors" ]]; then
    echo "ok"; PASSED=$((PASSED + 1))
  else
    echo "FAIL"; printf '%s\n' "$errors" | sed '/^$/d'; FAILED+=("$name")
  fi
}

#        name                            asset                          exit  score parts  R  L
run_case one_track                       one_track.mid                  0     RH           0
run_case one_track_two_hands_in_one      piano_one_track_two_hands.mid  0     RH+LH        0
run_case two_tracks                      two_tracks.mid                 0     RH,LH        0  1
run_case two_tracks_without_conductor    two_tracks_no_tempo.mid        0     RH,LH        0  1
# parts keep the file's order whatever the argument order (the import page may send the hands reversed)
run_case two_tracks_right_hand_second    two_tracks.mid                 0     RH,LH        1  0
run_case two_tracks_only_one_chosen      two_tracks.mid                 0     RH           0
run_case two_tracks_only_the_second      two_tracks.mid                 0     LH           1
# MuseScore joins two piano tracks on the same channel into one part: a grand staff, RH above, LH below
run_case two_hands_on_the_same_channel   two_hands_same_channel.mid     0     RH+LH        0  1
run_case four_tracks_piano_hands         four_tracks.mid                0     RH,LH        0  1
run_case four_tracks_one_other_track     four_tracks.mid                0     ST           2
run_case four_tracks_non_adjacent        four_tracks.mid                0     RH,ST        2  0
# the import page numbers empty tracks too (MuseScore drops them): RH is track 1 here
run_case empty_track_is_numbered         with_empty_track.mid           0     RH,LH        1  2
run_case empty_track_chosen              with_empty_track.mid           0     LH           0  2
# format 0, both hands in one track on two channels: the import page shows two tracks
run_case format0_channels_both           format0_two_channels.mid       0     RH,LH        0  1
run_case format0_channels_left_only      format0_two_channels.mid       0     LH           1
run_case track_out_of_range              one_track.mid                  fail  -            3
run_case left_track_out_of_range         two_tracks.mid                 fail  -            0  5
run_case only_an_empty_track             with_empty_track.mid           fail  -            0
run_case same_track_twice                two_tracks.mid                 0     RH           0  0
run_case no_track                        two_tracks.mid                 fail  -            ""
run_case track_not_a_number              two_tracks.mid                 fail  -            x

echo
echo "$PASSED passed, ${#FAILED[@]} failed${FAILED:+: ${FAILED[*]}}"
[[ ${#FAILED[@]} -eq 0 ]]
