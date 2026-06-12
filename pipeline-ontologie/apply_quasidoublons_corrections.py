#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tache 3 (Option A) : applique les corrections d'orthographe (espaces/casse en
trop) pour 28/29 groupes de quasi-doublons detectes par
find_quasi_doublons_corrections.py.

Le 29e groupe ('muscle dysmorphia') est un FAUX doublon (relation
parent/enfant skos:broader) -> exclu, NE PAS CORRIGER (cf.
session_quasidoublons_etat.md).

- Corrige les cellules CLASS/sub-class 1-4 de data-csv/Class-Hierarchy-V1.csv
- Corrige les skos:prefLabel de skos-acad-enrichment.ttl

Mode dry-run par defaut (affiche les remplacements sans ecrire).
Lancer avec --write pour appliquer.
"""

import argparse
import csv
import re
from collections import defaultdict
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
INPUT_CSV = BASE_DIR / "data-csv" / "Class-Hierarchy-V1.csv"
ENRICHMENT_TTL = BASE_DIR / "skos-acad-enrichment.ttl"
LABEL_COLS = ["CLASS", "sub-class 1", "sub-class 2", "sub-class 3", "sub-class 4"]

# Groupe a NE PAS corriger (faux doublon parent/enfant, cf. memoire)
EXCLUDED_GROUPS = {"muscle dysmorphia"}


def find_corrections():
    """Reproduit la logique de find_quasi_doublons_corrections.py et renvoie
    une liste de (form, canonical, sources) pour les groupes NON exclus."""
    variants = defaultdict(lambda: defaultdict(lambda: [0, set()]))

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

    with open(ENRICHMENT_TTL, encoding="utf-8") as f:
        content = f.read()
    for label in re.findall(r'skos:prefLabel "([^"]+)"', content):
        key = label.strip().lower()
        variants[key][label][0] += 1
        variants[key][label][1].add("enrichment.ttl")

    groups = {k: v for k, v in variants.items() if len(v) > 1}

    corrections = []
    for key, forms in sorted(groups.items()):
        if key in EXCLUDED_GROUPS:
            continue
        stripped_counts = defaultdict(int)
        for form, (n, _sources) in forms.items():
            stripped_counts[form.strip()] += n
        ranked = sorted(
            stripped_counts.items(),
            key=lambda kv: (-kv[1], not kv[0][:1].isupper()),
        )
        canonical = ranked[0][0]

        for form, (n, sources) in forms.items():
            if form != canonical:
                corrections.append((form, canonical, sources))

    return corrections


def apply_csv_corrections(corrections, write):
    csv_corrections = {form: canonical for form, canonical, sources in corrections
                        if "CSV" in sources}

    with open(INPUT_CSV, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        rows = list(reader)
    header = rows[0]
    col_idx = {name: header.index(name) for name in LABEL_COLS if name in header}

    n_applied = 0
    for row in rows[1:]:
        for col in col_idx.values():
            if col >= len(row):
                continue
            val = row[col]
            if val in csv_corrections:
                print(f"  CSV  : {val!r} -> {csv_corrections[val]!r}")
                if write:
                    row[col] = csv_corrections[val]
                n_applied += 1

    print(f"\n{n_applied} cellule(s) CSV corrigee(s) (sur {len(csv_corrections)} formes attendues)")

    if write:
        with open(INPUT_CSV, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f, delimiter=";")
            writer.writerows(rows)
        print(f"[OK] Ecrit : {INPUT_CSV}")


def apply_enrichment_corrections(corrections, write):
    ttl_corrections = {form: canonical for form, canonical, sources in corrections
                        if "enrichment.ttl" in sources}

    with open(ENRICHMENT_TTL, encoding="utf-8") as f:
        content = f.read()

    n_applied = 0
    for form, canonical in ttl_corrections.items():
        old = f'skos:prefLabel "{form}"'
        new = f'skos:prefLabel "{canonical}"'
        count = content.count(old)
        print(f"  TTL  : {form!r} -> {canonical!r}  ({count} occurrence(s))")
        if count == 0:
            print(f"    !! ATTENTION : forme introuvable dans {ENRICHMENT_TTL.name}")
        n_applied += count
        content = content.replace(old, new)

    print(f"\n{n_applied} occurrence(s) TTL corrigee(s) (sur {len(ttl_corrections)} formes attendues)")

    if write:
        with open(ENRICHMENT_TTL, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"[OK] Ecrit : {ENRICHMENT_TTL}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true",
                         help="Applique les corrections (sinon dry-run)")
    args = parser.parse_args()

    corrections = find_corrections()
    print(f"Corrections a appliquer : {len(corrections)} (groupe 'muscle dysmorphia' exclu)\n")

    print("=== Fichier CSV (data-csv/Class-Hierarchy-V1.csv) ===")
    apply_csv_corrections(corrections, args.write)

    print("\n=== Fichier TTL (skos-acad-enrichment.ttl) ===")
    apply_enrichment_corrections(corrections, args.write)

    if not args.write:
        print("\n(dry-run, rien ecrit. Relancer avec --write pour appliquer)")


if __name__ == "__main__":
    main()
