#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import csv
from collections import defaultdict

def create_unique_analysis_ids():
    """
    Crée des IDs d'analyse uniques en ajoutant .1, .2, .3, etc. 
    pour chaque occurrence du même Analysis_ID
    """
    input_file = 'data-csv-converted/IA-DAS-Data-cleaned.csv'
    output_file = 'data-csv-converted/IA-DAS-Data-unique-ids.csv'
    
    print(f"Lecture du fichier: {input_file}")
    
    # Lire toutes les lignes
    with open(input_file, 'r', encoding='utf-8', newline='') as f:
        reader = csv.reader(f)
        rows = list(reader)
    
    if not rows:
        print("Erreur: Fichier vide!")
        return
    
    headers = rows[0]
    data_rows = rows[1:]
    
    print(f"Lignes de données originales: {len(data_rows)}")
    
    # Trouver l'index de la colonne Analysis_ID
    analysis_id_index = None
    for i, header in enumerate(headers):
        if header.strip() == 'Analysis_ID':
            analysis_id_index = i
            break
    
    if analysis_id_index is None:
        print("Erreur: Colonne 'Analysis_ID' non trouvée!")
        return
    
    print(f"Colonne Analysis_ID trouvée à l'index: {analysis_id_index}")
    
    # Compter les occurrences de chaque Analysis_ID
    analysis_id_counts = defaultdict(int)
    
    # Créer les nouveaux IDs uniques
    new_rows = []
    
    for row in data_rows:
        if len(row) > analysis_id_index and row[analysis_id_index].strip():
            original_id = row[analysis_id_index].strip()
            analysis_id_counts[original_id] += 1
            
            # Créer le nouvel ID unique
            if analysis_id_counts[original_id] == 1:
                new_id = original_id
            else:
                new_id = f"{original_id}.{analysis_id_counts[original_id] - 1}"
            
            # Créer la nouvelle ligne avec le nouvel ID
            new_row = row.copy()
            new_row[analysis_id_index] = new_id
            new_rows.append(new_row)
        else:
            # Garder les lignes sans Analysis_ID telles quelles
            new_rows.append(row)
    
    print(f"Lignes traitées: {len(new_rows)}")
    
    # Afficher quelques statistiques
    print(f"\nStatistiques des Analysis_ID originaux:")
    duplicates = {aid: count for aid, count in analysis_id_counts.items() if count > 1}
    print(f"IDs avec des doublons: {len(duplicates)}")
    print(f"Total des doublons créés: {sum(count - 1 for count in duplicates.values())}")
    
    # Afficher quelques exemples
    print(f"\nExemples de transformation:")
    examples = list(duplicates.items())[:5]
    for aid, count in examples:
        print(f"  Analysis_ID {aid}: {count} occurrences -> {aid}, {aid}.1, {aid}.2, ...")
    
    # Sauvegarder le nouveau fichier
    print(f"\nSauvegarde: {output_file}")
    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(new_rows)
    
    print(f"\n[OK] Transformation terminée!")
    print(f"  - Lignes originales: {len(data_rows)}")
    print(f"  - Lignes avec IDs uniques: {len(new_rows)}")
    print(f"  - Analysis_IDs originaux: {len(analysis_id_counts)}")
    print(f"  - Analysis_IDs uniques créés: {len([row[analysis_id_index] for row in new_rows if len(row) > analysis_id_index and row[analysis_id_index].strip()])}")

if __name__ == "__main__":
    create_unique_analysis_ids()