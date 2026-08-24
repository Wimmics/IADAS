#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Corrige le mapping Synonym -> skos:altLabel de la hierarchie des variables.

Probleme : mapping-hierarchy.ttl lit la colonne "Synonym" a chaque niveau
(sub-class 1 a 5) independamment. Sur une ligne donnee, tous les niveaux
non vides de cette ligne recoivent donc le meme synonyme, y compris les
concepts parents pour qui ce synonyme ne s'applique pas (il appartient a
leur enfant, le niveau le plus profond rempli de la ligne).

Correction : on repartit la valeur de "Synonym" vers une colonne dediee
au niveau le plus profond non vide de chaque ligne (Synonym_level1 a
Synonym_level5), une seule colonne remplie par ligne. Le mapping RML doit
ensuite lire Synonym_levelN au lieu de Synonym dans chacun des 5 blocs.
"""

import csv
from pathlib import Path

INPUT_FILE = Path('data-csv-converted/Class-Hierarchy-V1-cleaned.csv')
LEVEL_COLUMNS = ['sub-class 1', 'sub-class 2', 'sub-class 3', 'sub-class 4', 'sub-class 5']


def split_synonym_by_deepest_level(input_file=INPUT_FILE):
    with open(input_file, 'r', encoding='utf-8', newline='') as f:
        rows = list(csv.reader(f))

    headers = rows[0]
    data_rows = rows[1:]

    if 'Synonym' not in headers:
        raise Exception("Colonne 'Synonym' introuvable dans le fichier")

    synonym_idx = headers.index('Synonym')
    level_indices = [headers.index(c) for c in LEVEL_COLUMNS if c in headers]
    if len(level_indices) != len(LEVEL_COLUMNS):
        missing = [c for c in LEVEL_COLUMNS if c not in headers]
        raise Exception(f"Colonnes de niveau manquantes: {missing}")

    new_headers = headers + [f'Synonym_level{i + 1}' for i in range(len(LEVEL_COLUMNS))]

    filled_counts = [0] * len(LEVEL_COLUMNS)
    skipped_no_level = 0
    new_rows = []

    for row in data_rows:
        row = row + [''] * (len(headers) - len(row))
        synonym_value = row[synonym_idx].strip()

        new_cols = [''] * len(LEVEL_COLUMNS)
        if synonym_value:
            deepest = None
            for i, idx in enumerate(level_indices):
                if row[idx].strip():
                    deepest = i
            if deepest is not None:
                new_cols[deepest] = synonym_value
                filled_counts[deepest] += 1
            else:
                skipped_no_level += 1

        new_rows.append(row + new_cols)

    with open(input_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(new_headers)
        writer.writerows(new_rows)

    total_synonym_rows = sum(1 for r in data_rows if r[synonym_idx].strip())
    print("Synonym reparti par niveau le plus profond non vide :")
    for i, count in enumerate(filled_counts):
        print(f"  Synonym_level{i + 1}: {count} lignes")
    print(f"  Lignes avec Synonym mais aucun niveau rempli (ignorees): {skipped_no_level}")
    print(f"  Total lignes avec Synonym non vide: {total_synonym_rows}")
    print(f"  Total reparti: {sum(filled_counts)}")


if __name__ == '__main__':
    split_synonym_by_deepest_level()
