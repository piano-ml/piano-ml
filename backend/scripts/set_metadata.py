# scripts/set_metadata.py
import sys
import re
import io
import os
import tempfile
import xml.etree.ElementTree as ET
from music21 import converter, metadata


def detect_cue_notes(xml_text):
    """Retourne une liste de chaînes correspondant aux balises <note> qui contiennent des indications de 'cue'.

    On détecte deux formes courantes :
    - un élément <type ... size="cue">...</type>
    - ou un élément <cue/> / <cue>...</cue>
    """
    # Patrons pour détecter un <type ... size="cue"> ou un <cue/>, insensible à la casse
    cue_pattern = re.compile(
        r'(<note[^>]*>.*?(?:<type[^>]*\bsize=["\']?cue["\']?[^>]*>.*?</type>|<cue(?:\s*/>|>.*?</cue>)).*?</note>)',
        re.IGNORECASE | re.DOTALL,
    )
    return cue_pattern.findall(xml_text)


def remove_cue_notes(xml_text):
    """Supprime toutes les balises <note> contenant des marqueurs de 'cue' et renvoie le XML nettoyé.

    Retourne un tuple (cleaned_xml, removed_count).
    """
    cue_pattern = re.compile(
        r'(<note[^>]*>.*?(?:<type[^>]*\bsize=["\']?cue["\']?[^>]*>.*?</type>|<cue(?:\s*/>|>.*?</cue>)).*?</note>)',
        re.IGNORECASE | re.DOTALL,
    )
    matches = cue_pattern.findall(xml_text)
    if not matches:
        return xml_text, 0
    cleaned = cue_pattern.sub('', xml_text)
    return cleaned, len(matches)


def detect_grace_notes(xml_text):
    """Retourne une liste de chaînes correspondant aux balises <note> qui contiennent des indications de 'grace'.

    On détecte un élément <grace/> ou <grace>...</grace>
    Le pattern gère aussi les namespaces XML potentiels.
    """
    # Pattern plus robuste qui gère <grace/>, <grace />, <grace></grace> avec ou sans namespace
    grace_pattern = re.compile(
        r'<note[^>]*>.*?<(?:\w+:)?grace\s*(?:/>|>.*?</(?:\w+:)?grace>).*?</note>',
        re.IGNORECASE | re.DOTALL,
    )
    return grace_pattern.findall(xml_text)


def remove_grace_notes(xml_text):
    """Supprime toutes les balises <note> contenant des marqueurs de 'grace' et renvoie le XML nettoyé.

    Retourne un tuple (cleaned_xml, removed_count).
    """
    # Pattern plus robuste qui gère <grace/>, <grace />, <grace></grace> avec ou sans namespace
    grace_pattern = re.compile(
        r'<note[^>]*>.*?<(?:\w+:)?grace\s*(?:/>|>.*?</(?:\w+:)?grace>).*?</note>',
        re.IGNORECASE | re.DOTALL,
    )
    matches = grace_pattern.findall(xml_text)
    if not matches:
        return xml_text, 0
    cleaned = grace_pattern.sub('', xml_text)
    return cleaned, len(matches)


# --- Ornaments handling: detect and remove ornament tags like <trill-mark/> while keeping the <note> ---

def _local_name(tag):
    return tag.split('}')[-1] if '}' in tag else tag


def detect_ornaments(xml_text):
    """Retourne une liste des occurrences d'ornements trouvés (chaînes XML) dans les notes.

    Utilise ElementTree pour robustesse. Si le XML est malformé, on retombe sur une regex simple.
    """
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        # fallback regex: détecte <trill-mark.../> ou <trill-mark>...</trill-mark>
        ornament_pattern = re.compile(r'(<(?:trill-mark|mordent|turn|shake|tremolo)[^>]*>(?:.*?)</(?:trill-mark|mordent|turn|shake|tremolo)>|<(?:trill-mark|mordent|turn|shake|tremolo)\s*/>)', re.IGNORECASE | re.DOTALL)
        return ornament_pattern.findall(xml_text)

    found = []
    for note in root.iter():
        if _local_name(note.tag) != 'note':
            continue
        # chercher notations/ornaments descendants
        for notations in note:
            if _local_name(notations.tag) != 'notations':
                continue
            for ornaments in notations:
                if _local_name(ornaments.tag) != 'ornaments':
                    continue
                # lister les enfants d'ornaments
                for orn in ornaments:
                    lname = _local_name(orn.tag)
                    if lname in ('trill-mark', 'mordent', 'turn', 'shake', 'tremolo'):
                        found.append(ET.tostring(orn, encoding='unicode'))
    return found


def remove_ornaments_etree(xml_text):
    """Supprime les éléments d'ornement (trill-mark, mordent, turn, shake, tremolo) dans les notes.

    Conserve la note elle-même. Retourne (cleaned_xml, removed_count).
    Si le XML est malformé, on retombe sur un simple remplacement regex qui enlève les balises d'ornement.
    """
    try:
        parser = ET.XMLParser(encoding='utf-8')
        root = ET.fromstring(xml_text, parser=parser)
    except ET.ParseError:
        # fallback regex pour supprimer les ornements autonomes
        ornament_pattern = re.compile(r'<(?:trill-mark|mordent|turn|shake|tremolo)(?:\s[^>]*)?\s*/?>|<(?:trill-mark|mordent|turn|shake|tremolo)(?:\s[^>]*)?>.*?</(?:trill-mark|mordent|turn|shake|tremolo)>', re.IGNORECASE | re.DOTALL)
        matches = ornament_pattern.findall(xml_text)
        if not matches:
            return xml_text, 0
        cleaned = ornament_pattern.sub('', xml_text)
        return cleaned, len(matches)

    removed = 0
    # parcourir toutes les notes et enlever les ornements ciblés
    for note in root.iter():
        if _local_name(note.tag) != 'note':
            continue
        # trouver notations/ornaments et supprimer les enfants 'ornament'
        for notations in list(note):
            if _local_name(notations.tag) != 'notations':
                continue
            for ornaments in list(notations):
                if _local_name(ornaments.tag) != 'ornaments':
                    continue
                for orn in list(ornaments):
                    lname = _local_name(orn.tag)
                    if lname in ('trill-mark', 'mordent', 'turn', 'shake', 'tremolo'):
                        ornaments.remove(orn)
                        removed += 1
                # si ornaments est maintenant vide, le retirer
                if len(list(ornaments)) == 0:
                    notations.remove(ornaments)
            # si notations est maintenant vide, le retirer
            if len(list(notations)) == 0:
                # retirer directement 'notations' du noeud 'note'
                try:
                    note.remove(notations)
                except Exception:
                    # en cas d'échec (rare), ignorer
                    pass
    # Note: ElementTree ne fournit pas de parent direct; la suppression ci-dessus se fait sur les enfants accessibles,
    # donc les notations vides ont été retirées quand elles étaient enfants directs de note.

    if removed == 0:
        return xml_text, 0

    cleaned_bytes = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    cleaned_xml = cleaned_bytes.decode('utf-8')
    return cleaned_xml, removed


def detect_arpeggiate(xml_text):
    """Retourne une liste des occurrences d'arpeggiate trouvées (chaînes XML) dans les notations.

    Utilise ElementTree pour robustesse. Si le XML est malformé, on retombe sur une regex simple.
    """
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        # fallback regex: détecte <arpeggiate.../> ou <arpeggiate>...</arpeggiate>
        arpeggiate_pattern = re.compile(r'(<arpeggiate[^>]*>(?:.*?)</arpeggiate>|<arpeggiate\s*/>)', re.IGNORECASE | re.DOTALL)
        return arpeggiate_pattern.findall(xml_text)

    found = []
    for note in root.iter():
        if _local_name(note.tag) != 'note':
            continue
        # chercher notations descendants
        for notations in note:
            if _local_name(notations.tag) != 'notations':
                continue
            # chercher arpeggiate directement dans notations
            for child in notations:
                lname = _local_name(child.tag)
                if lname == 'arpeggiate':
                    found.append(ET.tostring(child, encoding='unicode'))
    return found


def remove_arpeggiate_etree(xml_text):
    """Supprime les éléments arpeggiate dans les notations.

    Conserve la note elle-même. Retourne (cleaned_xml, removed_count).
    Si le XML est malformé, on retombe sur un simple remplacement regex qui enlève les balises arpeggiate.
    """
    try:
        parser = ET.XMLParser(encoding='utf-8')
        root = ET.fromstring(xml_text, parser=parser)
    except ET.ParseError:
        # fallback regex pour supprimer les arpeggiate autonomes
        arpeggiate_pattern = re.compile(r'<arpeggiate(?:\s[^>]*)?\s*/?>|<arpeggiate(?:\s[^>]*)?>.*?</arpeggiate>', re.IGNORECASE | re.DOTALL)
        matches = arpeggiate_pattern.findall(xml_text)
        if not matches:
            return xml_text, 0
        cleaned = arpeggiate_pattern.sub('', xml_text)
        return cleaned, len(matches)

    removed = 0
    # parcourir toutes les notes et enlever les arpeggiate
    for note in root.iter():
        if _local_name(note.tag) != 'note':
            continue
        # trouver notations et supprimer les enfants 'arpeggiate'
        for notations in list(note):
            if _local_name(notations.tag) != 'notations':
                continue
            for child in list(notations):
                lname = _local_name(child.tag)
                if lname == 'arpeggiate':
                    notations.remove(child)
                    removed += 1
            # si notations est maintenant vide, le retirer
            if len(list(notations)) == 0:
                try:
                    note.remove(notations)
                except Exception:
                    pass

    if removed == 0:
        return xml_text, 0

    cleaned_bytes = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    cleaned_xml = cleaned_bytes.decode('utf-8')
    return cleaned_xml, removed


# compat wrapper
def remove_arpeggiate(xml_text):
    return remove_arpeggiate_etree(xml_text)


# compat wrapper
def remove_ornaments(xml_text):
    return remove_ornaments_etree(xml_text)


def process_musicxml(path, title, composer):
    """Lit un fichier MusicXML, supprime les notes cue et grace, parse le XML nettoyé avec music21,
    applique les métadonnées, puis réécrit le fichier MusicXML (écrase le fichier d'origine).
    """
    with open(path, 'r', encoding='utf-8') as f:
        xml_text = f.read()

    cues = detect_cue_notes(xml_text)
    removed_count = 0
    grace_removed = 0
    ornaments_removed = 0
    arpeggiate_removed = 0
    if cues:
        print(f"Detected {len(cues)} cue note(s). Removing them before parsing...")
        cleaned_xml, removed_count = remove_cue_notes(xml_text)
        xml_for_parse = cleaned_xml
    else:
        print("No cue notes detected. Parsing original file.")
        xml_for_parse = xml_text

    # Supprimer les notes grace
    graces = detect_grace_notes(xml_for_parse)
    if graces:
        print(f"Detected {len(graces)} grace note(s). Removing them before parsing...")
        xml_for_parse, grace_removed = remove_grace_notes(xml_for_parse)
    else:
        print("No grace notes detected. Parsing original file.")

    # Supprimer les ornements (p.ex. <trill-mark/>) mais garder les notes
    ornaments = detect_ornaments(xml_for_parse)
    if ornaments:
        print(f"Detected {len(ornaments)} ornament element(s). Removing them before parsing...")
        xml_for_parse, ornaments_removed = remove_ornaments(xml_for_parse)
    else:
        print("No ornament elements detected. Parsing original file.")

    # Supprimer les arpeggiate mais garder les notes
    arpeggiate = detect_arpeggiate(xml_for_parse)
    if arpeggiate:
        print(f"Detected {len(arpeggiate)} arpeggiate element(s). Removing them before parsing...")
        xml_for_parse, arpeggiate_removed = remove_arpeggiate(xml_for_parse)
    else:
        print("No arpeggiate elements detected. Parsing original file.")

    # Essayer de parser directement depuis un buffer en forçant le format MusicXML
    try:
        score = converter.parse(io.StringIO(xml_for_parse), format='musicxml')
    except Exception as e:
        print("Parsing from memory failed (falling back to temporary file):", e)
        # fallback: écrire un fichier temporaire et parser depuis le fichier
        with tempfile.NamedTemporaryFile('w', suffix='.musicxml', delete=False, encoding='utf-8') as tmp:
            tmp.write(xml_for_parse)
            tmp_path = tmp.name
        try:
            score = converter.parse(tmp_path)
        finally:
            try:
                os.remove(tmp_path)
            except Exception:
                pass

    # Appliquer métadonnées
    if not score.metadata:
        score.metadata = metadata.Metadata()
    score.metadata.title = title
    score.metadata.composer = composer

    # Backup du fichier original avant d'écraser
    try:
        backup_path = path + '.bak'
        if not os.path.exists(backup_path):
            with open(path, 'rb') as orig, open(backup_path, 'wb') as bak:
                bak.write(orig.read())
    except Exception as e:
        print("Warning: could not create backup:", e)

    # Écrire le résultat (écrase le fichier MusicXML)
    score.write('musicxml', fp=path)
    print(f"Wrote updated MusicXML to {path} (removed {removed_count} cue note(s), {grace_removed} grace note(s), {ornaments_removed} ornament(s), {arpeggiate_removed} arpeggiate(s)).")


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: python -m music21 scripts/set_metadata.py <musicxml> <title> <composer>")
        sys.exit(1)

    musicxml, title, composer = sys.argv[1], sys.argv[2], sys.argv[3]
    process_musicxml(musicxml, title, composer)
