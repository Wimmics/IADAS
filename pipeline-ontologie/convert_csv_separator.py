#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import csv
import os
from pathlib import Path

def convert_csv_separator(input_file, output_file):
    """
    Convertit un fichier CSV avec séparateur point-virgule en virgule
    
    Args:
        input_file: chemin du fichier d'entrée
        output_file: chemin du fichier de sortie
    """
    print(f"Conversion: {input_file} -> {output_file}")
    
    # Lire le fichier avec point-virgule comme séparateur
    with open(input_file, 'r', encoding='utf-8-sig', newline='') as infile:
        reader = csv.reader(infile, delimiter=';')
        rows = list(reader)
    
    # Écrire avec virgule comme séparateur
    with open(output_file, 'w', encoding='utf-8', newline='') as outfile:
        writer = csv.writer(outfile, delimiter=',', quoting=csv.QUOTE_MINIMAL)
        writer.writerows(rows)
    
    print(f"  [OK] Converti {len(rows)} lignes")

def convert_all_csv_files():
    """
    Convertit tous les fichiers CSV du dossier data-csv
    """
    # Créer le dossier de sortie s'il n'existe pas
    input_dir = Path('data-csv')
    output_dir = Path('data-csv-converted')
    output_dir.mkdir(exist_ok=True)
    
    # Liste des fichiers à convertir
    csv_files = [
        'IA-DAS-Data.csv',
        'Class-Hierarchy-V1.csv',
        'Sport-Hierarchy-cleaned.csv'  # Utiliser la version nettoyée
    ]
    
    print("=== Conversion des fichiers CSV ===\n")
    
    for csv_file in csv_files:
        input_path = input_dir / csv_file
        output_path = output_dir / csv_file
        
        if input_path.exists():
            convert_csv_separator(input_path, output_path)
        else:
            print(f"  [ATTENTION] Fichier non trouvé: {input_path}")
    
    print("\n=== Conversion terminée ===")
    print(f"Les fichiers convertis sont dans: {output_dir}")

if __name__ == "__main__":
    convert_all_csv_files()