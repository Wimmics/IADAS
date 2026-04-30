import csv
import os

def clean_sport_hierarchy():
    """
    Nettoie le fichier Sport-Hierarchy.csv en supprimant les colonnes vides
    et en créant une version nettoyée du fichier
    """
    input_file = 'data-csv/Sport-Hierarchy.csv'
    output_file = 'data-csv/Sport-Hierarchy-cleaned.csv'
    
    print(f"Lecture du fichier: {input_file}")
    
    # Lire le fichier original
    with open(input_file, 'r', encoding='utf-8-sig', newline='') as f:
        reader = csv.reader(f, delimiter=';')
        rows = list(reader)
    
    if not rows:
        print("Le fichier est vide!")
        return
    
    # Analyser les colonnes pour trouver celles qui ne sont pas vides
    num_cols = len(rows[0])
    non_empty_cols = []
    
    # Pour chaque colonne, vérifier si elle contient des données
    for col_idx in range(num_cols):
        has_data = False
        for row in rows:
            if col_idx < len(row) and row[col_idx].strip():
                has_data = True
                break
        if has_data:
            non_empty_cols.append(col_idx)
    
    print(f"Colonnes originales: {num_cols}")
    print(f"Colonnes non vides: {len(non_empty_cols)}")
    print(f"Indices des colonnes conservées: {non_empty_cols[:10]}...")  # Afficher les 10 premiers
    
    # Créer le fichier nettoyé avec seulement les colonnes non vides
    cleaned_rows = []
    for row in rows:
        cleaned_row = [row[i] if i < len(row) else '' for i in non_empty_cols]
        cleaned_rows.append(cleaned_row)
    
    # Afficher les en-têtes du fichier nettoyé
    if cleaned_rows:
        print(f"\nEn-têtes du fichier nettoyé: {cleaned_rows[0]}")
        print(f"Nombre de lignes: {len(cleaned_rows)}")
    
    # Écrire le fichier nettoyé
    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f, delimiter=';')
        writer.writerows(cleaned_rows)
    
    print(f"\nFichier nettoyé créé: {output_file}")
    
    # Afficher quelques lignes d'exemple
    print("\nExemple des premières lignes du fichier nettoyé:")
    for i, row in enumerate(cleaned_rows[:5]):
        print(f"Ligne {i}: {' | '.join(row[:4])}...")  # Afficher les 4 premières colonnes

if __name__ == "__main__":
    clean_sport_hierarchy()