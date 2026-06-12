#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Detecte les groupes de labels "quasi-doublons" (memes une fois strip()+lower())
entre :
  - les colonnes CLASS / sub-class 1-4 de data-csv/Class-Hierarchy-V1.csv (source RML, 621 concepts)
  - les skos:prefLabel de skos-acad-enrichment.ttl (157 concepts ajoutes a la main)

et propose une forme canonique pour chaque groupe (Option C : normalisation).
Affiche la liste des corrections "forme actuelle -> forme canonique" pour
verification manuelle (Option A : a reporter dans l'Excel de reference).
"""

import csv
import re
from collections import defaultdict
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
INPUT_CSV = BASE_DIR / "data-csv" / "Class-Hierarchy-V1.csv"
ENRICHMENT_TTL = BASE_DIR / "skos-acad-enrichment.ttl"
LABEL_COLS = ["CLASS", "sub-class 1", "sub-class 2", "sub-class 3", "sub-class 4"]


def main():
    # variants[label.strip().lower()] -> {exact_form: (count, sources_set)}
    variants = defaultdict(lambda: defaultdict(lambda: [0, set()]))

    # --- 1. CSV (source RML, 621 concepts) ---
    with open(INPUT_CSV, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        rows = list(reader)
    header = rows[0]
    col_idx = {name: header.index(name) for name in LABEL_COLS if name in header}

    for row in rows[1:]:
        for col in col_idx.values():
            if col >= len(row):
                continue
            val = row[col]
            if val.strip() == "":
                continue
            key = val.strip().lower()
            variants[key][val][0] += 1
            variants[key][val][1].add("CSV")

    # --- 2. skos-acad-enrichment.ttl (157 concepts manuels) ---
    with open(ENRICHMENT_TTL, encoding="utf-8") as f:
        content = f.read()
    for label in re.findall(r'skos:prefLabel "([^"]+)"', content):
        key = label.strip().lower()
        variants[key][label][0] += 1
        variants[key][label][1].add("enrichment.ttl")

    groups = {k: v for k, v in variants.items() if len(v) > 1}

    print(f"Lignes CSV lues: {len(rows) - 1}")
    print(f"Groupes quasi-doublons (CSV + enrichment.ttl) = {len(groups)}\n")

    all_corrections = {}  # exact_form -> canonical (only when different)

    for key, forms in sorted(groups.items()):
        # 1. Toujours stripper -> regrouper par forme strippee, sommer les occurrences
        stripped_counts = defaultdict(int)
        for form, (n, _sources) in forms.items():
            stripped_counts[form.strip()] += n

        # 2. Canonique = forme strippee majoritaire ; en cas d'egalite, celle qui
        #    commence par une majuscule (convention "Sentence case" du fichier)
        ranked = sorted(
            stripped_counts.items(),
            key=lambda kv: (-kv[1], not kv[0][:1].isupper()),
        )
        canonical = ranked[0][0]

        print(f"- {key!r}  ==> CANONIQUE: {canonical!r}")
        for form, (n, sources) in sorted(forms.items(), key=lambda kv: -kv[1][0]):
            if form != canonical:
                marker = "  -> a corriger"
                all_corrections[form] = canonical
            else:
                marker = ""
            print(f"    {form!r:55} ({n:>3}x, {','.join(sorted(sources))}){marker}")

    print(f"\nTotal groupes: {len(groups)}")
    print(f"Total formes a corriger (cellules CSV/enrichment): {len(all_corrections)}\n")

    print("=" * 70)
    print("LISTE DES CORRECTIONS (forme actuelle -> forme canonique)")
    print("=" * 70)
    for form, canonical in all_corrections.items():
        print(f"  {form!r:55} -> {canonical!r}")


if __name__ == "__main__":
    main()
