#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Modelisation des relations complexes (validee par Molka Tounsi Dhouib, 24/07/2026) :
normalise les colonnes Mediator/Measure Mediator/Moderator/Measure Moderator de
data-csv/IA-DAS-Data.csv en remplacant "N.A."/"NA" par une chaine vide.

Necessaire car le mapping RML ne saute une ligne (pas de triple genere) que si la
valeur source est vraiment vide - "N.A." est une valeur textuelle comme une autre
pour RML, elle creerait donc une fausse "variable mediatrice N.A." sur les analyses
qui n'ont pas de mediateur/moderateur.

Mode dry-run par defaut (n'ecrit rien) : affiche juste les statistiques.
Lancer avec --write pour sauvegarder le CSV.
"""

import argparse
import csv
from collections import Counter
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
INPUT_CSV = BASE_DIR / "data-csv" / "IA-DAS-Data.csv"
COLUMNS_TO_NORMALIZE = ["Mediator", "Measure Mediator", "Moderator", "Measure Moderator"]
NA_VALUES = {"N.A.", "NA", "N.A", "n.a.", "na"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true",
                         help="Ecrit les colonnes normalisees dans le CSV (sinon dry-run)")
    args = parser.parse_args()

    with open(INPUT_CSV, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        rows = list(reader)

    header = rows[0]
    indices = {}
    for col in COLUMNS_TO_NORMALIZE:
        if col not in header:
            raise ValueError(f"Colonne introuvable: {col!r}")
        indices[col] = header.index(col)

    stats = Counter()
    for row in rows[1:]:
        for col, idx in indices.items():
            if idx < len(row) and row[idx].strip() in NA_VALUES:
                row[idx] = ""
                stats[col] += 1

    print(f"Lignes traitees : {len(rows) - 1}")
    for col in COLUMNS_TO_NORMALIZE:
        print(f"  {col:<20} {stats[col]:>6} valeurs N.A./NA -> vide")

    if args.write:
        with open(INPUT_CSV, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f, delimiter=";")
            writer.writerows(rows)
        print(f"\n[OK] Ecrit : {INPUT_CSV}")
    else:
        print("\n(dry-run, rien ecrit. Relancer avec --write pour sauvegarder)")


if __name__ == "__main__":
    main()
