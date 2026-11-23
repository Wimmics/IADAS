
import argparse
import csv
from collections import Counter
from pathlib import Path
import openpyxl

UEAB = 'Unhealthy eating attitudes and behaviors'
FILES = [
    ('Sport hierarchy_VF_26oct26.xlsx', 'Hierarchy', 'Sport_Hierarchy.csv'),
    ('Class_Hierarchy_VF_13oct26xlsx (1).xlsx', 'Hierarchy', 'Class_Hierarchy.csv'),
    ('Supplementary 4_Data Extraction_09.11.2026.xlsx', 'data', 'IACAD_Analysis.csv'),
]
MISSING = {'', 'na', 'n.a.', 'n.a', 'n/a', 'nan', 'none'}


def meaningful(v):
    return v.strip().casefold() not in MISSING


def read_excel(path, sheet):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        ws = wb[sheet]
        first = next(ws.iter_rows(min_row=1, max_row=1, values_only=True))
        columns = [(i, str(v).strip()) for i, v in enumerate(first)
                   if v is not None and str(v).strip()]
        headers = [h for _, h in columns]
        if not headers or len(headers) != len(set(headers)):
            raise ValueError(f'En-tetes vides ou dupliques : {path}')
        rows = []
        for values in ws.iter_rows(min_row=2, max_col=columns[-1][0]+1,
                                   values_only=True):
            row = {h: '' if values[i] is None else str(values[i])
                   for i, h in columns}
            if any(v.strip() for v in row.values()):
                rows.append(row)
        return headers, rows
    finally:
        wb.close()


def prepare(index, headers, rows):
    renames = {}
    if index == 1:
        renames = {f'Sub-class {i}': f'sub-class {i}' for i in range(1, 6)}
        renames.update({'Definition': 'Définition', 'Validated tools': 'Outils'})
    elif index == 2:
        renames = {
            'Analysis ID': 'Analysis_ID', 'Sport name': 'Sport_name',
            UEAB: 'DEAB', UEAB + ' measure': 'DEAB_measure',
            UEAB + '_CLASS': 'DEAB_CLASS',
            'Specifications of unhealthy eating attitudes and behaviors': 'Specifications of DEAB',
            'Related_Factor measure': 'Related_Factor_measure',
            'N mobilized in analysis': 'N mobilized in analyses',
        }
        renames.update({UEAB + f'_sub-class {i}': f'DEAB_sub-class {i}'
                        for i in range(1, 6)})
    headers = [renames.get(h, h) for h in headers]
    if len(headers) != len(set(headers)):
        raise ValueError('Renommage ambigu des colonnes')
    rows = [{renames.get(k, k): v for k, v in r.items()} for r in rows]
    if index == 1:
        levels = ['CLASS'] + [f'sub-class {i}' for i in range(1, 6)]
        if not set(levels + ['Synonym']).issubset(headers):
            raise ValueError('Colonnes de hierarchie manquantes')
        headers = levels + [h for h in headers if h not in levels]
        # Le mapping existant attend un synonyme au niveau le plus profond.
        extras = [f'Synonym_level{i}' for i in range(1, 6)]
        headers += extras
        for row in rows:
            row.update(dict.fromkeys(extras, ''))
            for i in range(5, 0, -1):
                if meaningful(row[f'sub-class {i}']):
                    row[f'Synonym_level{i}'] = row['Synonym']
                    break
    if index == 2:
        required = ['Analysis_ID', 'Sport_name', 'DEAB', 'DEAB_CLASS',
                    'Related_Factor_CLASS']
        if not set(required).issubset(headers):
            raise ValueError('Colonnes extraction manquantes : ' + str(set(required)-set(headers)))
        for prefix in ('DEAB', 'Related_Factor'):
            final = prefix + '_final_sub-class'
            if final not in headers:
                headers.append(final)
            for row in rows:
                candidates = [row.get(prefix + '_CLASS', '')] + [
                    row.get(prefix + f'_sub-class {i}', '') for i in range(1, 6)]
                row[final] = next((v.strip() for v in reversed(candidates)
                                   if meaningful(v)), '')
        ids = [r['Analysis_ID'].strip() for r in rows]
        repeated = sum(1 for k, n in Counter(ids).items() if k and n > 1)
        blank_count = ids.count('')
        print(f'IDs repetes : {repeated} ; IDs vides : {blank_count}. Conserves sans modification.')
    return headers, rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path.home() / 'Downloads')
    parser.add_argument('--sortie', type=Path,
                        default=Path(__file__).resolve().parent / 'csv_iadas')
    args = parser.parse_args()
    # Refuse tout remplacement ; choisir un nouveau dossier pour relancer.
    for filename, sheet, output in FILES:
        if not (args.source / filename).is_file():
            parser.error(f'Fichier introuvable : {args.source / filename}')
        if (args.sortie / output).exists():
            parser.error(f'CSV deja present : {args.sortie / output}. Choisir un autre --sortie.')
    prepared = []
    for i, (filename, sheet, output) in enumerate(FILES):
        headers, rows = read_excel(args.source / filename, sheet)
        headers, rows = prepare(i, headers, rows)
        prepared.append((output, headers, rows))
    args.sortie.mkdir(parents=True, exist_ok=True)
    for output, headers, rows in prepared:
        path = args.sortie / output
        with path.open('x', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=headers, delimiter=';')
            writer.writeheader()
            writer.writerows(rows)
        with path.open(encoding='utf-8', newline='') as f:
            reader = csv.DictReader(f, delimiter=';')
            if reader.fieldnames != headers or list(reader) != rows:
                raise ValueError(f'Echec de verification : {path}')
        print(f'{output} : {len(rows)} lignes, {len(headers)} colonnes (verifie)')
    print(f'Dossier : {args.sortie.resolve()}')
    print('Sub class 4 est conservee ; le mapping sport actuel doit etre adapte pour l exploiter.')
    print('Conversion uniquement : pas de calcul effectSize ni de generation RDF.')


if __name__ == '__main__':
    main()

