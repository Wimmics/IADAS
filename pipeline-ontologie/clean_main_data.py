#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import csv
import os
from pathlib import Path

def clean_main_data_csv():
    """
    Nettoie le fichier IA-DAS-Data.csv :
    - Supprime les colonnes vides
    - Supprime les lignes vides
    - Convertit ; en ,
    """
    input_file = 'data-csv/IA-DAS-Data.csv'
    output_file_cleaned = 'data-csv/IA-DAS-Data-cleaned.csv'
    output_file_converted = 'data-csv-converted/IA-DAS-Data-cleaned.csv'
    
    print(f"1. Lecture du fichier: {input_file}")
    
    # Lire le fichier avec point-virgule
    with open(input_file, 'r', encoding='utf-8-sig', newline='') as f:
        reader = csv.reader(f, delimiter=';')
        rows = list(reader)
    
    print(f"   Lignes originales: {len(rows)}")
    print(f"   Colonnes originales: {len(rows[0]) if rows else 0}")
    
    # Supprimer les lignes complètement vides
    rows_non_empty = []
    for row in rows:
        if any(cell.strip() for cell in row):
            rows_non_empty.append(row)
    
    print(f"   Lignes non vides: {len(rows_non_empty)}")
    
    if not rows_non_empty:
        print("Erreur: Aucune ligne avec des données!")
        return
    
    # Identifier les colonnes non vides
    num_cols = max(len(row) for row in rows_non_empty)
    non_empty_cols = []
    
    for col_idx in range(num_cols):
        has_data = False
        for row in rows_non_empty:
            if col_idx < len(row) and row[col_idx].strip():
                has_data = True
                break
        if has_data:
            non_empty_cols.append(col_idx)
    
    print(f"   Colonnes non vides: {len(non_empty_cols)}")
    
    # Garder seulement les colonnes non vides
    cleaned_rows = []
    for row in rows_non_empty:
        cleaned_row = [row[i] if i < len(row) else '' for i in non_empty_cols]
        cleaned_rows.append(cleaned_row)
    
    # Afficher les en-têtes
    if cleaned_rows:
        print(f"\n2. Apercu des en-têtes du fichier nettoyé:")
        headers = cleaned_rows[0]
        for i, header in enumerate(headers[:20]):  # Afficher les 20 premiers
            if header.strip():
                print(f"   Colonne {i}: {header}")
        if len(headers) > 20:
            print(f"   ... et {len(headers) - 20} autres colonnes")
    
    # Sauvegarder avec point-virgule (version nettoyée)
    print(f"\n3. Sauvegarde du fichier nettoyé: {output_file_cleaned}")
    with open(output_file_cleaned, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f, delimiter=';')
        writer.writerows(cleaned_rows)
    
    # Créer le dossier si nécessaire
    Path('data-csv-converted').mkdir(exist_ok=True)
    
    # Sauvegarder avec virgule (version convertie)
    print(f"4. Conversion et sauvegarde avec virgule: {output_file_converted}")
    with open(output_file_converted, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL)
        writer.writerows(cleaned_rows)
    
    print(f"\n[OK] Nettoyage termine!")
    print(f"  - Lignes: {len(rows)} -> {len(cleaned_rows)}")
    print(f"  - Colonnes: {num_cols} -> {len(non_empty_cols)}")
    
    # Afficher quelques lignes d'exemple
    print(f"\nExemple des 2 premieres lignes:")
    for i, row in enumerate(cleaned_rows[:2]):
        # Afficher seulement les 5 premières colonnes pour la lisibilité
        try:
            preview = ' | '.join(str(cell)[:30] for cell in row[:5])
            if len(row) > 5:
                preview += ' | ...'
            print(f"  Ligne {i}: {preview}")
        except:
            print(f"  Ligne {i}: [Contient des caracteres speciaux]")

if __name__ == "__main__":
    clean_main_data_csv()