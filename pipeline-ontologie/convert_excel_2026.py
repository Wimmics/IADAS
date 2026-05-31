#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Convertit le fichier Excel 2026 (Supplementary 4_Data Extraction.xlsx)
vers data-csv/IA-DAS-Data.csv (separateur ;) pret pour le pipeline RML.

Normalise les headers pour correspondre au mapping Molka 2026 :
- Colonnes utilisees dans des templates URI : espaces -> underscores
- Colonnes utilisees dans rml:reference : gardees telles quelles
- Espaces en fin de nom : supprimes
"""

import openpyxl
import csv
import os
from pathlib import Path

EXCEL_PATH = Path(r"C:\Users\core solutions\Desktop\Stage\Ressources\Supplementary 4_Data Extraction.xlsx")
OUTPUT_CSV = Path(__file__).parent / "data-csv" / "IA-DAS-Data.csv"

# Normalisation des headers :
# Cles = nom exact dans Excel 2026
# Valeurs = nom attendu par le mapping Molka 2026
HEADER_RENAMES = {
    "Analysis ID":       "Analysis_ID",       # template {Analysis_ID}
    "Sport name":        "Sport_name",         # template {Sport_name}
    "Measure VD":        "Measure_VD",         # template {Measure_VD}
    "VD_final sub-class": "VD_final_sub-class", # template {VD_final_sub-class}
    "Measure VI":        "Measure_VI",          # template {Measure_VI}
    "VI_final sub-class": "VI_final_sub-class", # template {VI_final_sub-class}
}


def normalize_header(h):
    if h is None:
        return ""
    h = h.strip()
    return HEADER_RENAMES.get(h, h)


def convert():
    print(f"Lecture : {EXCEL_PATH}")
    if not EXCEL_PATH.exists():
        raise FileNotFoundError(f"Excel introuvable : {EXCEL_PATH}")

    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    if not rows:
        raise ValueError("Excel vide")

    # Normaliser les headers
    raw_headers = rows[0]
    headers = [normalize_header(h) for h in raw_headers]

    print(f"Colonnes trouvees : {len(headers)}")
    print(f"Lignes de donnees : {len(rows) - 1}")

    # Verifier les headers importants
    required = ["Analysis_ID", "Sport_name", "Measure_VD", "VD_final_sub-class",
                "Measure_VI", "VI_final_sub-class", "Title", "Country"]
    for r in required:
        if r in headers:
            print(f"  [OK] {r}")
        else:
            print(f"  [MANQUANT] {r}")

    # Ecrire le CSV avec separateur ;
    OUTPUT_CSV.parent.mkdir(exist_ok=True)
    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(headers)
        for row in rows[1:]:
            # Convertir None en chaine vide
            cleaned = [("" if v is None else str(v)) for v in row]
            writer.writerow(cleaned)

    print(f"\n[OK] CSV genere : {OUTPUT_CSV}")
    print(f"     {len(rows) - 1} lignes, {len(headers)} colonnes")


if __name__ == "__main__":
    convert()
