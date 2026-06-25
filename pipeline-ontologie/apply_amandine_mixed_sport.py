"""
Applique la decision d'Amandine pour les 20 analyses "Mixed sport (e.g., ...)"
Undo du split en 7 lignes -> 1 ligne avec la liste des sports comme valeur unique.
"""
import csv, pathlib

SPLIT_SPORTS = {'Soccer', 'Basketball', 'Track and field/Athletics', 'Softball', 'Swimming', 'Diving', 'Gymnastics'}
AMANDINE_VALUE = 'soccer, basketball, track and field, softball, swimming, diving, gymnastics'

path = pathlib.Path(__file__).parent / 'data-csv' / 'IA-DAS-Data.csv'

with open(path, encoding='utf-8', newline='') as f:
    reader = csv.reader(f, delimiter=';')
    headers = next(reader)
    rows = list(reader)

sport_col = headers.index('Sport_name')
id_col = next(i for i, h in enumerate(headers) if h in ('Analysis_ID', 'Code'))

def row_key(row):
    return tuple(v for i, v in enumerate(row) if i != sport_col and i != id_col)

new_rows = []
i = 0
merged = 0

while i < len(rows):
    row = rows[i]
    sport = row[sport_col].strip() if len(row) > sport_col else ''

    if sport in SPLIT_SPORTS:
        key = row_key(row)
        group = [row]
        j = i + 1
        while j < len(rows) and len(group) < 7 and row_key(rows[j]) == key and rows[j][sport_col].strip() in SPLIT_SPORTS:
            group.append(rows[j])
            j += 1

        if len(group) == 7 and {r[sport_col].strip() for r in group} == SPLIT_SPORTS:
            merged_row = group[0].copy()
            merged_row[sport_col] = AMANDINE_VALUE
            new_rows.append(merged_row)
            merged += 1
            i = j
            continue

    new_rows.append(row)
    i += 1

with open(path, 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f, delimiter=';')
    writer.writerow(headers)
    writer.writerows(new_rows)

print(f'Avant : {len(rows)} lignes')
print(f'Groupes fusionnes : {merged}')
print(f'Apres : {len(new_rows)} lignes')
print(f'Sport_name mis a jour : "{AMANDINE_VALUE}"')
print(f'Fichier sauvegarde : {path}')
