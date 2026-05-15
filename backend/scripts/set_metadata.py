# scripts/set_metadata.py
import sys
import re
import io
import os
import tempfile
import xml.etree.ElementTree as ET
from music21 import converter, metadata


# --- Ornaments handling: detect and remove ornament tags like <trill-mark/> while keeping the <note> ---

def _local_name(tag):
    return tag.split('}')[-1] if '}' in tag else tag


# --- Credits handling: detect and remove <credit> (incl. <credit-words>) entirely ---

def detect_credits(xml_text):
    """Retourne une liste des balises <credit> trouvées (chaînes XML).

    Utilise ElementTree pour robustesse. Si le XML est malformé, on retombe sur une regex simple.
    """
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        credit_pattern = re.compile(r'(<credit\b[^>]*>.*?</credit>)', re.IGNORECASE | re.DOTALL)
        return credit_pattern.findall(xml_text)

    found = []
    for elem in root.iter():
        if _local_name(elem.tag) == 'credit':
            found.append(ET.tostring(elem, encoding='unicode'))
    return found

    def detect_rights(xml_text):
        """Retourne une liste des balises <rights> trouvées (chaînes XML).

        Utilise ElementTree pour robustesse. Si le XML est malformé, on retombe sur une regex simple.
        """
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError:
            rights_pattern = re.compile(r'(<rights\b[^>]*>.*?</rights>)', re.IGNORECASE | re.DOTALL)
            return rights_pattern.findall(xml_text)

        found = []
        for elem in root.iter():
            if _local_name(elem.tag) == 'rights':
                found.append(ET.tostring(elem, encoding='unicode'))
        return found

    def remove_rights(xml_text):
        """Supprime toutes les balises <rights> (et leur contenu) et renvoie le XML nettoyé.

        Retourne un tuple (cleaned_xml, removed_count). Utilise ElementTree avec fallback regex.
        """
        try:
            parser = ET.XMLParser(encoding='utf-8')
            root = ET.fromstring(xml_text, parser=parser)
        except ET.ParseError:
            rights_pattern = re.compile(r'<rights\b[^>]*>.*?</rights>', re.IGNORECASE | re.DOTALL)
            matches = rights_pattern.findall(xml_text)
            if not matches:
                return xml_text, 0
            cleaned = rights_pattern.sub('', xml_text)
            return cleaned, len(matches)

        removed = 0
        for parent in list(root.iter()):
            for child in list(parent):
                if _local_name(child.tag) == 'rights':
                    parent.remove(child)
                    removed += 1

        if removed == 0:
            return xml_text, 0

        cleaned_bytes = ET.tostring(root, encoding='utf-8', xml_declaration=True)
        cleaned_xml = cleaned_bytes.decode('utf-8')
        return cleaned_xml, removed

def remove_credits(xml_text):
    """Supprime toutes les balises <credit> (et leur contenu) et renvoie le XML nettoyé.

    Retourne un tuple (cleaned_xml, removed_count). Utilise ElementTree avec fallback regex.
    """
    try:
        parser = ET.XMLParser(encoding='utf-8')
        root = ET.fromstring(xml_text, parser=parser)
    except ET.ParseError:
        credit_pattern = re.compile(r'<credit\b[^>]*>.*?</credit>', re.IGNORECASE | re.DOTALL)
        matches = credit_pattern.findall(xml_text)
        if not matches:
            return xml_text, 0
        cleaned = credit_pattern.sub('', xml_text)
        return cleaned, len(matches)

    removed = 0
    for parent in list(root.iter()):
        for child in list(parent):
            if _local_name(child.tag) == 'credit':
                parent.remove(child)
                removed += 1

    if removed == 0:
        return xml_text, 0

    cleaned_bytes = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    cleaned_xml = cleaned_bytes.decode('utf-8')
    return cleaned_xml, removed


# --- Movement-title handling: detect and remove <movement-title> entirely ---

def detect_movement_title(xml_text):
    """Retourne une liste des balises <movement-title> trouvées (chaînes XML).

    Utilise ElementTree pour robustesse. Si le XML est malformé, on retombe sur une regex simple.
    """
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        mt_pattern = re.compile(r'(<movement-title\b[^>]*>.*?</movement-title>)', re.IGNORECASE | re.DOTALL)
        return mt_pattern.findall(xml_text)

    found = []
    for elem in root.iter():
        if _local_name(elem.tag) == 'movement-title':
            found.append(ET.tostring(elem, encoding='unicode'))
    return found


def remove_movement_title(xml_text):
    """Supprime toutes les balises <movement-title> (et leur contenu) et renvoie le XML nettoyé.

    Retourne un tuple (cleaned_xml, removed_count). Utilise ElementTree avec fallback regex.
    """
    try:
        parser = ET.XMLParser(encoding='utf-8')
        root = ET.fromstring(xml_text, parser=parser)
    except ET.ParseError:
        mt_pattern = re.compile(r'<movement-title\b[^>]*>.*?</movement-title>', re.IGNORECASE | re.DOTALL)
        matches = mt_pattern.findall(xml_text)
        if not matches:
            return xml_text, 0
        cleaned = mt_pattern.sub('', xml_text)
        return cleaned, len(matches)

    removed = 0
    for parent in list(root.iter()):
        for child in list(parent):
            if _local_name(child.tag) == 'movement-title':
                parent.remove(child)
                removed += 1

    if removed == 0:
        return xml_text, 0

    cleaned_bytes = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    cleaned_xml = cleaned_bytes.decode('utf-8')
    return cleaned_xml, removed


# --- Print new-page handling: detect and remove <print new-page="yes"> entirely ---

def detect_print_new_page(xml_text):
    """Retourne une liste des balises <print new-page="yes"> trouvées (chaînes XML).

    Utilise ElementTree pour robustesse. Si le XML est malformé, on retombe sur une regex simple.
    """
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        print_pattern = re.compile(r'(<print\b[^>]*new-page=["\']yes["\'][^>]*>.*?</print>|<print\b[^>]*new-page=["\']yes["\'][^>]*/>)', re.IGNORECASE | re.DOTALL)
        return print_pattern.findall(xml_text)

    found = []
    for elem in root.iter():
        if _local_name(elem.tag) == 'print' and elem.get('new-page') == 'yes':
            found.append(ET.tostring(elem, encoding='unicode'))
    return found


def remove_print_new_page(xml_text):
    """Supprime toutes les balises <print new-page="yes"> (et leur contenu) et renvoie le XML nettoyé.

    Retourne un tuple (cleaned_xml, removed_count). Utilise ElementTree avec fallback regex.
    """
    try:
        parser = ET.XMLParser(encoding='utf-8')
        root = ET.fromstring(xml_text, parser=parser)
    except ET.ParseError:
        print_pattern = re.compile(r'<print\b[^>]*new-page=["\']yes["\'][^>]*>.*?</print>|<print\b[^>]*new-page=["\']yes["\'][^>]*/>', re.IGNORECASE | re.DOTALL)
        matches = print_pattern.findall(xml_text)
        if not matches:
            return xml_text, 0
        cleaned = print_pattern.sub('', xml_text)
        return cleaned, len(matches)

    removed = 0
    for parent in list(root.iter()):
        for child in list(parent):
            if _local_name(child.tag) == 'print' and child.get('new-page') == 'yes':
                parent.remove(child)
                removed += 1

    if removed == 0:
        return xml_text, 0

    cleaned_bytes = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    cleaned_xml = cleaned_bytes.decode('utf-8')
    return cleaned_xml, removed


def clean_musicxml_optimized(xml_text):
    """Version optimisée qui parse le XML une seule fois et applique toutes les transformations.

    Retourne (cleaned_xml, stats_dict) où stats_dict contient les compteurs de suppressions.
    """
    stats = {
        'cue_notes': 0,
        'grace_notes': 0,
        'ornaments': 0,
        'arpeggiate': 0,
        'credits': 0,
        'creators': 0,
        'movement_title': 0,
        'print_new_page': 0
    }

    # Parser une seule fois avec ElementTree
    try:
        parser = ET.XMLParser(encoding='utf-8')
        root = ET.fromstring(xml_text, parser=parser)
    except ET.ParseError as e:
        print(f"Warning: XML parsing failed ({e}), using regex fallback for remaining operations")
        # Fallback: utiliser les fonctions regex existantes
        return _clean_with_regex_fallback(xml_text, stats)

    # Parcourir l'arbre une seule fois et appliquer toutes les transformations
    for parent in list(root.iter()):
        for child in list(parent):
            child_tag = _local_name(child.tag)

            # Supprimer credits
            if child_tag == 'credit':
                parent.remove(child)
                stats['credits'] += 1
                continue

            # Supprimer creator (ex: <creator type="composer">...)</n+
            if child_tag == 'creator':
                parent.remove(child)
                stats['creators'] += 1
                continue

            # Supprimer movement-title
            if child_tag == 'movement-title':
                parent.remove(child)
                stats['movement_title'] += 1
                continue

            # Supprimer print avec new-page="yes"
            if child_tag == 'print':
                # Vérifier si l'attribut new-page est "yes"
                if child.get('new-page') == 'yes':
                    parent.remove(child)
                    stats['print_new_page'] += 1
                    continue


    # Sérialiser une seule fois
    cleaned_bytes = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    cleaned_xml = cleaned_bytes.decode('utf-8')

    return cleaned_xml, stats


def _clean_with_regex_fallback(xml_text, stats):
    """Fallback utilisant les fonctions regex si le parsing ElementTree échoue."""
    xml_for_parse = xml_text


    # Credits
    credits = detect_credits(xml_for_parse)
    if credits:
        xml_for_parse, credits_removed = remove_credits(xml_for_parse)
        stats['credits'] = credits_removed

    # Creator tags (identification/creator)
    creator_pattern = re.compile(r'<creator\b[^>]*>.*?</creator>|<creator\b[^>]*/>', re.IGNORECASE | re.DOTALL)
    creator_matches = creator_pattern.findall(xml_for_parse)
    if creator_matches:
        xml_for_parse = creator_pattern.sub('', xml_for_parse)
        stats['creators'] = len(creator_matches)

    # Movement-title
    mts = detect_movement_title(xml_for_parse)
    if mts:
        xml_for_parse, movement_title_removed = remove_movement_title(xml_for_parse)
        stats['movement_title'] = movement_title_removed

    # Print new-page
    prints = detect_print_new_page(xml_for_parse)
    if prints:
        xml_for_parse, print_removed = remove_print_new_page(xml_for_parse)
        stats['print_new_page'] = print_removed

    return xml_for_parse, stats


def process_musicxml(path, title, composer):
    """Lit un fichier MusicXML, supprime les notes cue et grace, parse le XML nettoyé avec music21,
    applique les métadonnées, puis réécrit le fichier MusicXML (écrase le fichier d'origine).
    """
    with open(path, 'r', encoding='utf-8') as f:
        xml_text = f.read()

    # Utiliser la version optimisée
    xml_for_parse, stats = clean_musicxml_optimized(xml_text)

    # Afficher les statistiques
    if stats['cue_notes'] > 0:
        print(f"Removed {stats['cue_notes']} cue note(s)")
    if stats['grace_notes'] > 0:
        print(f"Removed {stats['grace_notes']} grace note(s)")
    if stats['ornaments'] > 0:
        print(f"Removed {stats['ornaments']} ornament element(s)")
    if stats['arpeggiate'] > 0:
        print(f"Removed {stats['arpeggiate']} arpeggiate element(s)")
    if stats['credits'] > 0:
        print(f"Removed {stats['credits']} credit element(s)")
    if stats['creators'] > 0:
        print(f"Removed {stats['creators']} creator element(s)")
    if stats['movement_title'] > 0:
        print(f"Removed {stats['movement_title']} movement-title element(s)")
    if stats['print_new_page'] > 0:
        print(f"Removed {stats['print_new_page']} print new-page element(s)")

    # Parser depuis un fichier temporaire (plus fiable avec music21)
    with tempfile.NamedTemporaryFile('w', suffix='.musicxml', delete=False, encoding='utf-8') as tmp:
        tmp.write(xml_for_parse)
        tmp_path = tmp.name
    try:
        score = converter.parse(tmp_path, format='musicxml')
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass

    # Backup du fichier original avant d'écraser
    try:
        backup_path = path + '.bak'
        if not os.path.exists(backup_path):
            with open(path, 'rb') as orig, open(backup_path, 'wb') as bak:
                bak.write(orig.read())
    except Exception as e:
        print("Warning: could not create backup:", e)

    # Modifier les métadonnées directement dans le XML au lieu de passer par music21.write()
    # pour éviter les problèmes de conversion de durées "inexpressible"
    try:
        root = ET.fromstring(xml_for_parse)
    except ET.ParseError as e:
        print(f"Error: Could not parse XML for metadata insertion: {e}")
        return

    # Trouver ou créer la section <work-title>
    work_info = root.find('.//{*}work')
    if work_info is None:
        # Créer un élément <work> s'il n'existe pas
        work_info = ET.Element('work')
        root.insert(0, work_info)

    work_title = work_info.find('{*}work-title')
    if work_title is None:
        work_title = ET.SubElement(work_info, 'work-title')
    work_title.text = title

    # Trouver ou créer la section <identification> pour le compositeur
    identification = root.find('.//{*}identification')
    if identification is None:
        identification = ET.Element('identification')
        root.insert(1 if work_info is not None else 0, identification)

    composer_elem = identification.find('{*}composer')
    if composer_elem is None:
        composer_elem = ET.SubElement(identification, 'composer')
    composer_elem.text = composer

    # Find or create creator element with type="composer"
    creator_elem = None
    for elem in identification.findall('{*}creator'):
        if elem.get('type') == 'composer':
            creator_elem = elem
            break
    if creator_elem is None:
        creator_elem = ET.SubElement(identification, 'creator')
        creator_elem.set('type', 'composer')
    creator_elem.text = composer

    # Écrire le XML modifié directement sans passer par music21.write()
    output_bytes = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    with open(path, 'wb') as f:
        f.write(output_bytes)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: python -m music21 scripts/set_metadata.py <musicxml> <title> <composer>")
        sys.exit(1)

    musicxml, title, composer = sys.argv[1], sys.argv[2], sys.argv[3]
    process_musicxml(musicxml, title, composer)
