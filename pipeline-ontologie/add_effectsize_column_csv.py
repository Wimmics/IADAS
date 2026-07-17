#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tache 2 (validee reunion Mme Molka 11/06/2026, regle de significativite
confirmee par Stephanie Meriaux le 17/07/2026) :
Ajoute une NOUVELLE colonne "effectSize" dans data-csv/IA-DAS-Data.csv,
calculee a partir de :
1. la significativite ("Direction of the relationship") en premier :
   - NS -> "N.S." (quelle que soit la valeur du coefficient)
   - NA ou cellule vide -> "N.A."
   - + ou - -> on regarde le coefficient (etape 2)
2. uniquement si significatif (+/-), la valeur numerique (r, rho ou beta)
   dans "Degree of relationship" + seuils Cohen 1988, sur la valeur absolue.
   Les R²/ΔR² et les valeurs non interpretables (hors [-1;1], format non
   reconnu) restent non classifiees (colonne vide) - deja le comportement
   naturel de l'extraction par regex, aucun traitement special necessaire.

- Ne supprime/modifie AUCUNE colonne existante (notamment pas
  "Degree of relationship" / relationDegreeSecondary).
- Mode dry-run par defaut (n'ecrit rien) : affiche juste les statistiques.
  Lancer avec --write pour sauvegarder le CSV.
"""

import argparse
import csv
import re
from collections import Counter
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
INPUT_CSV = BASE_DIR / "data-csv" / "IA-DAS-Data.csv"
SOURCE_COL = "Degree of relationship"
SIGNIFICANCE_COL = "Direction of the relationship"
TARGET_COL = "effectSize"

RE_R = re.compile(r"^\s*r\s*=\s*(-?[0-9.]+)", re.IGNORECASE)
RE_RHO = re.compile(r"^\s*rho\s*=\s*(-?[0-9.]+)", re.IGNORECASE)
RE_BETA = re.compile(r"^\s*[β\U0001D6C3]\s*=\s*(-?[0-9.]+)")


def categorize(value):
    """Cohen 1988 thresholds - identiques a THRESHOLDS dans index.js."""
    abs_val = abs(value)
    if abs_val < 0.1:
        return "negligible"
    if abs_val < 0.3:
        return "weak"
    if abs_val < 0.5:
        return "moderate"
    return "strong"


def compute_effect_size(cell_value, significance):
    sig = str(significance).strip().upper()

    if sig == "NS":
        return "N.S."
    if sig in ("NA", ""):
        return "N.A."
    if sig not in ("+", "-"):
        # valeur inattendue dans la colonne de significativite (ex. erreur de
        # saisie type reference de formule Excel) : ne pas deviner, laisser
        # non classifie plutot que mal classer.
        return ""

    # A partir d'ici, la relation est significative (+ ou -) : on regarde le coefficient.
    if not cell_value:
        return ""
    text = str(cell_value)

    for regex in (RE_R, RE_RHO, RE_BETA):
        m = regex.match(text)
        if not m:
            continue
        try:
            val = float(m.group(1))
        except ValueError:
            continue
        if abs(val) > 1.0:
            continue
        return categorize(val)

    return ""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true",
                         help="Ecrit la nouvelle colonne dans le CSV (sinon dry-run)")
    args = parser.parse_args()

    with open(INPUT_CSV, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        rows = list(reader)

    header = rows[0]
    if SOURCE_COL not in header:
        raise ValueError(f"Colonne source introuvable: {SOURCE_COL!r}")
    src_idx = header.index(SOURCE_COL)
    if SIGNIFICANCE_COL not in header:
        raise ValueError(f"Colonne de significativite introuvable: {SIGNIFICANCE_COL!r}")
    sig_idx = header.index(SIGNIFICANCE_COL)

    if TARGET_COL in header:
        print(f"Colonne {TARGET_COL!r} deja presente, elle sera mise a jour.")
        tgt_idx = header.index(TARGET_COL)
    else:
        print(f"Ajout de la colonne {TARGET_COL!r} en derniere position.")
        header.append(TARGET_COL)
        tgt_idx = len(header) - 1

    stats = Counter()
    for row in rows[1:]:
        src_val = row[src_idx] if src_idx < len(row) else ""
        sig_val = row[sig_idx] if sig_idx < len(row) else ""
        result = compute_effect_size(src_val, sig_val)
        stats[result or "<vide>"] += 1
        while len(row) <= tgt_idx:
            row.append("")
        row[tgt_idx] = result

    print(f"\nLignes traitees : {len(rows) - 1}")
    for k, n in stats.most_common():
        print(f"  {k:<15} {n:>6}")

    if args.write:
        with open(INPUT_CSV, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f, delimiter=";")
            writer.writerows(rows)
        print(f"\n[OK] Ecrit : {INPUT_CSV}")
    else:
        print("\n(dry-run, rien ecrit. Relancer avec --write pour sauvegarder)")


if __name__ == "__main__":
    main()
