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

    Utilise ElementTree pour robustesse (gère namespaces et formes auto‑fermantes).
    En cas d'échec de parsing, retombe sur une regex.
    """
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        # fallback regex: capture le <note> qui contient un <grace .../> ou <grace>...</grace>
        pattern = re.compile(
            r'(<note[^>]*>.*?<(?:\w+:)?grace\b[^>]*?(?:\/>|>.*?<\/(?:\w+:)?grace>).*?<\/note>)',
            re.IGNORECASE | re.DOTALL,
        )
        return pattern.findall(xml_text)

    found = []
    for note in root.iter():
        if _local_name(note.tag) != 'note':
            continue
        # chercher tout descendant 'grace' (gère namespaces grâce à _local_name)
        has_grace = False
        for desc in note.iter():
            if _local_name(desc.tag) == 'grace':
                has_grace = True
                break
        if has_grace:
            found.append(ET.tostring(note, encoding='unicode'))
    return found


def remove_grace_notes(xml_text):
    """Supprime toutes les balises <note> contenant des marqueurs de 'grace' et renvoie le XML nettoyé.

    Retourne un tuple (cleaned_xml, removed_count).
    Utilise ElementTree quand possible, sinon retombe sur la regex précédente.
    """
    try:
        parser = ET.XMLParser(encoding='utf-8')
        root = ET.fromstring(xml_text, parser=parser)
    except ET.ParseError:
        # fallback regex: supporte <grace/> et <grace>...</grace>
        grace_pattern = re.compile(
            r'<note[^>]*>.*?<(?:\w+:)?grace\s*(?:\/>|>.*?<\/(?:\w+:)?grace>).*?<\/note>',
            re.IGNORECASE | re.DOTALL,
        )
        matches = grace_pattern.findall(xml_text)
        if not matches:
            return xml_text, 0
        cleaned = grace_pattern.sub('', xml_text)
        return cleaned, len(matches)

    removed = 0
    # parcourir tous les éléments pour trouver les parents contenant des <note>
    for parent in list(root.iter()):
        for child in list(parent):
            if _local_name(child.tag) != 'note':
                continue
            # vérifier si la note contient un descendant 'grace'
            has_grace = False
            for desc in child.iter():
                if _local_name(desc.tag) == 'grace':
                    has_grace = True
                    break
            if has_grace:
                parent.remove(child)
                removed += 1

    if removed == 0:
        return xml_text, 0

    cleaned_bytes = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    cleaned_xml = cleaned_bytes.decode('utf-8')
    return cleaned_xml, removed


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
        'movement_title': 0,
        'print_new_page': 0
    }

    # Essayer d'abord avec regex pour les cue notes (car elles utilisent des patterns complexes)
    # puis parser une seule fois pour toutes les autres transformations
    cue_pattern = re.compile(
        r'(<note[^>]*>.*?(?:<type[^>]*\bsize=["\']?cue["\']?[^>]*>.*?</type>|<cue(?:\s*/>|>.*?</cue>)).*?</note>)',
        re.IGNORECASE | re.DOTALL,
    )
    cue_matches = cue_pattern.findall(xml_text)
    if cue_matches:
        stats['cue_notes'] = len(cue_matches)
        print(f"Detected {len(cue_matches)} cue note(s). Removing them...")
        xml_text = cue_pattern.sub('', xml_text)

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

            # Traiter les notes
            if child_tag == 'note':
                # Vérifier si c'est une grace note
                has_grace = any(_local_name(desc.tag) == 'grace' for desc in child.iter())
                if has_grace:
                    parent.remove(child)
                    stats['grace_notes'] += 1
                    continue

                # Nettoyer les ornements et arpeggiate dans les notations
                for notations in list(child):
                    if _local_name(notations.tag) != 'notations':
                        continue

                    for notation_child in list(notations):
                        notation_tag = _local_name(notation_child.tag)

                        # Supprimer arpeggiate
                        if notation_tag == 'arpeggiate':
                            notations.remove(notation_child)
                            stats['arpeggiate'] += 1

                        # Supprimer ornements
                        elif notation_tag == 'ornaments':
                            for orn in list(notation_child):
                                orn_tag = _local_name(orn.tag)
                                if orn_tag in ('trill-mark', 'mordent', 'turn', 'shake', 'tremolo'):
                                    notation_child.remove(orn)
                                    stats['ornaments'] += 1

                            # Supprimer le conteneur ornaments s'il est vide
                            if len(notation_child) == 0:
                                notations.remove(notation_child)

                    # Supprimer le conteneur notations s'il est vide
                    if len(notations) == 0:
                        child.remove(notations)

    # Sérialiser une seule fois
    cleaned_bytes = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    cleaned_xml = cleaned_bytes.decode('utf-8')

    return cleaned_xml, stats


def _clean_with_regex_fallback(xml_text, stats):
    """Fallback utilisant les fonctions regex si le parsing ElementTree échoue."""
    xml_for_parse = xml_text

    # Grace notes
    graces = detect_grace_notes(xml_for_parse)
    if graces:
        xml_for_parse, grace_removed = remove_grace_notes(xml_for_parse)
        stats['grace_notes'] = grace_removed

    # Ornaments
    ornaments = detect_ornaments(xml_for_parse)
    if ornaments:
        xml_for_parse, ornaments_removed = remove_ornaments(xml_for_parse)
        stats['ornaments'] = ornaments_removed

    # Arpeggiate
    arpeggiate = detect_arpeggiate(xml_for_parse)
    if arpeggiate:
        xml_for_parse, arpeggiate_removed = remove_arpeggiate(xml_for_parse)
        stats['arpeggiate'] = arpeggiate_removed

    # Credits
    credits = detect_credits(xml_for_parse)
    if credits:
        xml_for_parse, credits_removed = remove_credits(xml_for_parse)
        stats['credits'] = credits_removed

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

    # Appliquer métadonnées
    if not score.metadata:
        score.metadata = metadata.Metadata()
    score.metadata.title = title
    score.metadata.composer = composer

    # Supprimer movementName et movementNumber pour empêcher music21
    # de recréer automatiquement le tag <movement-title>
    score.metadata.movementName = None
    score.metadata.movementNumber = None


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


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: python -m music21 scripts/set_metadata.py <musicxml> <title> <composer>")
        sys.exit(1)

    musicxml, title, composer = sys.argv[1], sys.argv[2], sys.argv[3]
    process_musicxml(musicxml, title, composer)
