import os
import sys
import xml.etree.ElementTree as ET
from copy import deepcopy

from music21 import converter, stream

if len(sys.argv) not in (3, 4):
    print("Usage: python scripts/extract_midi_tracks.py <score_file> <track1> [track2]")
    sys.exit(1)

musicxml_path = sys.argv[1]
track1 = int(sys.argv[2])

track2 = None
if len(sys.argv) == 4:
    try:
        track2 = int(sys.argv[3])
    except ValueError:
        track2 = None

def _selected_indexes(total_parts: int, right_idx: int, left_idx: int | None) -> set[int]:
    if right_idx < 0 or right_idx >= total_parts:
        raise IndexError(f"track1 index {right_idx} out of range (0..{total_parts - 1})")

    if left_idx is None and total_parts == 2:
        left_idx = 1 - right_idx

    selected = {right_idx}
    if left_idx is not None:
        if left_idx < 0 or left_idx >= total_parts:
            raise IndexError(f"track2 index {left_idx} out of range (0..{total_parts - 1})")
        selected.add(left_idx)
    return selected


def _xml_tag(root: ET.Element, local: str) -> str:
    if root.tag.startswith("{"):
        ns_uri = root.tag.split("}", 1)[0][1:]
        return f"{{{ns_uri}}}{local}"
    return local


def _extract_parts_in_place_musicxml(path: str, right_idx: int, left_idx: int | None) -> bool:
    tree = ET.parse(path)
    root = tree.getroot()
    part_tag = _xml_tag(root, "part")
    part_list_tag = _xml_tag(root, "part-list")
    score_part_tag = _xml_tag(root, "score-part")
    part_group_tag = _xml_tag(root, "part-group")

    parts = root.findall(part_tag)
    if not parts:
        return False

    selected_indexes = _selected_indexes(len(parts), right_idx, left_idx)
    selected_ids = {
        parts[idx].attrib.get("id")
        for idx in sorted(selected_indexes)
        if parts[idx].attrib.get("id") is not None
    }

    for child in list(root):
        if child.tag == part_tag and child.attrib.get("id") not in selected_ids:
            root.remove(child)

    part_list = root.find(part_list_tag)
    if part_list is not None:
        for child in list(part_list):
            if child.tag == score_part_tag and child.attrib.get("id") not in selected_ids:
                part_list.remove(child)
            elif child.tag == part_group_tag:
                # Suppress grouping metadata that can become inconsistent after filtering parts.
                part_list.remove(child)

    tree.write(path, encoding="utf-8", xml_declaration=True)
    return True


base, ext = os.path.splitext(musicxml_path)
new_path = f"{base}.musicxml"

handled_by_xml = False
if ext.lower() in (".musicxml", ".xml"):
    try:
        handled_by_xml = _extract_parts_in_place_musicxml(new_path, track1, track2)
    except Exception as exc:
        print(
            f"MusicXML direct filtering failed ({exc}), trying music21 fallback...",
            file=sys.stderr,
        )

if not handled_by_xml:
    score = converter.parse(musicxml_path)
    selected_indexes = _selected_indexes(len(score.parts), track1, track2)

    new_score = stream.Score()
    for idx, part in enumerate(score.parts):
        if idx in selected_indexes:
            new_score.append(deepcopy(part))

    try:
        new_score.write("musicxml", fp=new_path, makeNotation=False)
    except TypeError:
        new_score.write("musicxml", fp=new_path)

print(f"Fichier créé : {new_path}")
