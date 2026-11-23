"""Normalisation automatique des analyses simples : une entree sportive par ligne.
Usage : py normalization.py
Aucune dependance externe. Le CSV original reste inchange.
Les libelles generiques et valeurs absentes sont conserves et signales.
La separation des sports ne produit pas de statistiques propres a chaque sport.
"""
import argparse
import csv
import re
from pathlib import Path

MISSING = {'', 'na', 'n.a.', 'n.a', 'n/a', 'nan', 'none'}
# Corrections facultatives, prioritaires sur les regles automatiques.
CORRECTIONS = {}


def top_level_parts(value):
    """Separe virgules, ; et retours de ligne hors parentheses."""
    parts, current, depth = [], [], 0
    for char in value:
        if char == '(':
            depth += 1
        elif char == ')':
            depth = max(0, depth - 1)
        if char in ',;\n\r' and depth == 0:
            parts.append(''.join(current))
            current = []
        else:
            current.append(char)
    parts.append(''.join(current))
    return parts


def split_sports(raw):
    value = raw.strip()
    if value in CORRECTIONS:
        return CORRECTIONS[value], 'Correction explicite'
    if value.casefold() in MISSING:
        return [value or 'N.A.'], 'Sport non renseigne dans la source'
    # Des parentheses numerotees decrivent une classification, pas une liste de sports.
    if re.search(r'\bdifferent sports\b|categorized|categorised', value, re.I):
        return [re.sub(r'\s+', ' ', value)], 'Description collective conservee ; sports non enumeres'
    # Ne jamais couper le nom compose track and field.
    marker = '__TRACK_FIELD__'
    value = re.sub(r'\btrack\s*(?:and|&|/)\s*field\b', marker, value, flags=re.I)
    result = []
    expanded = False
    for chunk in top_level_parts(value):
        chunk = re.sub(r'^\s*and\s+', '', chunk, flags=re.I).strip(' .')
        if not chunk:
            continue
        match = re.fullmatch(r'(.*?)\s*\((.*)\)\.?', chunk, re.S)
        if match:
            parent, inside = match.groups()
            parent = parent.strip()
            # Exemples explicites : les elements cites deviennent des entrees.
            example = bool(re.match(r'\s*(?:e\.g\.|i\.e\.)', inside, re.I))
            inside = re.sub(r'^\s*(?:e\.g\.|i\.e\.)\s*,?\s*', '', inside, flags=re.I)
            children, _ = split_sports(inside.replace(marker, 'track and field'))
            for child in children:
                child = child.replace('track and field', marker)
                if example or not parent or parent.lower() in child.lower():
                    result.append(child)
                else:
                    result.append(f'{parent} ({child})')
            expanded = True
        else:
            result.extend(re.split(r'\s+and\s+|\s*&\s*|/', chunk, flags=re.I))
    cleaned, seen = [], set()
    for item in result:
        item = re.sub(r'^\s*and\s+', '', item, flags=re.I)
        item = re.sub(r'\s+', ' ', item.replace(marker, 'track and field')).strip(' .')
        if item and item.casefold() not in seen:
            cleaned.append(item)
            seen.add(item.casefold())
    if not cleaned:
        cleaned = [raw.strip() or 'N.A.']
    note = 'Parentheses developpees automatiquement' if expanded else 'Separation automatique des libelles'
    if any(re.search(r'\bmixed\b|\bother\b|\bsports?\b', s, re.I) for s in cleaned):
        note += ' ; libelle collectif ou generique conserve'
    return cleaned, note


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path,
                        default=Path(__file__).resolve().parent / 'csv_iadas' / 'IACAD_Analysis.csv')
    parser.add_argument('--sortie', type=Path,
                        default=Path(__file__).resolve().parent / 'csv_iadas_normalized')
    args = parser.parse_args()
    with args.source.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f, delimiter=';')
        headers = reader.fieldnames or []
        required = {'Analysis_ID', 'Sport_name', 'Complexity of Analysis'}
        if not required.issubset(headers):
            raise ValueError(f'Colonnes manquantes : {required-set(headers)}')
        rows = list(reader)
    extra = ['Source_row', 'Sport_name_original', 'Analysis_sport_ID',
             'Sport_index', 'Sport_count', 'Normalization_note']
    if set(extra) & set(headers):
        raise ValueError('Utiliser le fichier original non normalise.')
    output, count = [], 0
    for source_row, row in enumerate(rows, start=2):
        if row['Complexity of Analysis'].strip().casefold() != 'simple analyses':
            continue
        count += 1
        sports, note = split_sports(row['Sport_name'])
        for index, sport in enumerate(sports, start=1):
            output.append({**row, 'Sport_name': sport,
                           'Source_row': str(source_row),
                           'Sport_name_original': row['Sport_name'],
                           'Analysis_sport_ID': f"{row['Analysis_ID']}_r{source_row}_s{index}",
                           'Sport_index': str(index), 'Sport_count': str(len(sports)),
                           'Normalization_note': note})
    assert len({r['Source_row'] for r in output}) == count
    assert len({r['Analysis_sport_ID'] for r in output}) == len(output)
    args.sortie.mkdir(parents=True, exist_ok=True)
    path = args.sortie / 'IA-DAS-Data-simple-par-sport.csv'
    with path.open('x', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=headers + extra, delimiter=';')
        writer.writeheader()
        writer.writerows(output)
    with path.open(encoding='utf-8', newline='') as f:
        assert list(csv.DictReader(f, delimiter=';')) == output
    print(f'Analyses simples conservees : {count}/{count}')
    print(f'Autres analyses exclues : {len(rows)-count}')
    print(f'Lignes apres separation : {len(output)}')
    print(f'Fichier : {path.resolve()}')
    print('Toutes les analyses simples sont traitees ; aucun fichier a verifier.')
    print('Les libelles non specifiques restent visibles dans Normalization_note.')


if __name__ == '__main__':
    main()
