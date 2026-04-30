#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Pipeline Complet IA-DAS - Génération d'Ontologie
================================================

Ce script automatise complètement la génération de l'ontologie IA-DAS depuis les fichiers Excel/CSV
jusqu'aux fichiers TTL finaux prêts pour Fuseki.

Auteur: Sara TAOUFIQ
Date: 2025
"""

import os
import csv
import subprocess
import sys
from pathlib import Path
from collections import defaultdict
import shutil

class PipelineIADAS:
    def __init__(self, base_dir=None):
        """
        Initialise le pipeline IA-DAS
        
        Args:
            base_dir (str): Répertoire de base (par défaut: répertoire courant)
            En vrai se serait interessant d'avoir les fichiers py dans un fichier python
            TO DO
        """
        self.base_dir = Path(base_dir) if base_dir else Path.cwd()
        self.data_csv_dir = self.base_dir / 'data-csv'
        self.data_converted_dir = self.base_dir / 'data-csv-converted'
        self.mapping_dir = self.base_dir / 'mapping'
        self.output_dir = self.base_dir / 'output'
        self.results_dir = self.base_dir / 'resultats'
        self.jar_file = self.base_dir / 'rmlmapper-7.3.3-r374-all.jar'
        
        # Créer les dossiers nécessaires
        self.data_converted_dir.mkdir(exist_ok=True)
        self.output_dir.mkdir(exist_ok=True)
        self.results_dir.mkdir(exist_ok=True)
        
        print(" Pipeline IA-DAS initialisé")
        print(f"   Répertoire de base: {self.base_dir}")
    
    def log(self, message, step=None):
        """Affiche un message de log formaté"""
        if step:
            print(f"\n{'='*60}")
            print(f"ÉTAPE {step}")
            print(f"{'='*60}")
        print(f" {message}")
    
    def check_prerequisites(self):
        """Vérifie que tous les prérequis sont disponibles"""
        self.log("Vérification des prérequis", 1)
        
        # Vérifier Java
        try:
            result = subprocess.run(['java', '-version'], capture_output=True, text=True)
            if result.returncode == 0:
                print(" Java disponible")
            else:
                raise Exception("Java non trouvé")
        except:
            print(" Java requis mais non trouvé")
            return False
        
        # Vérifier RMLMapper
        if not self.jar_file.exists():
            print(f" RMLMapper JAR non trouvé: {self.jar_file}")
            return False
        print(" RMLMapper JAR trouvé")
        
        # Vérifier fichiers CSV
        required_files = [
            'Sport-Hierarchy.csv',
            'Class-Hierarchy-V1.csv', 
            'IA-DAS-Data.csv'
        ]
        
        for file in required_files:
            if not (self.data_csv_dir / file).exists():
                print(f" Fichier requis manquant: {file}")
                return False
            print(f" {file} trouvé")
        
        # Vérifier mappings
        mapping_files = [
            'mapping-sport.ttl',
            'mapping-hierarchy.ttl',
            'mapping-ontology.ttl'
        ]
        
        for file in mapping_files:
            if not (self.mapping_dir / file).exists():
                print(f" Mapping requis manquant: {file}")
                return False
            print(f" {file} trouvé")
        
        print(" Tous les prérequis sont satisfaits")
        return True
    
    def clean_sport_hierarchy(self):
        """Nettoie la hiérarchie des sports"""
        self.log("Nettoyage de la hiérarchie des sports", 2)
        
        input_file = self.data_csv_dir / 'Sport-Hierarchy.csv'
        output_file = self.data_csv_dir / 'Sport-Hierarchy-cleaned.csv'
        
        print(f"   Lecture: {input_file}")
        
        with open(input_file, 'r', encoding='utf-8-sig', newline='') as f:
            reader = csv.reader(f, delimiter=';')
            rows = list(reader)
        
        if not rows:
            raise Exception("Fichier Sport-Hierarchy vide")
        
        print(f"   Lignes originales: {len(rows)}")
        print(f"   Colonnes originales: {len(rows[0]) if rows else 0}")
        
        # Supprimer lignes vides
        rows_non_empty = [row for row in rows if any(cell.strip() for cell in row)]
        print(f"   Lignes non vides: {len(rows_non_empty)}")
        
        # Identifier colonnes non vides (garder les 5 premières utiles)
        max_cols = min(5, max(len(row) for row in rows_non_empty))
        non_empty_cols = []
        
        for col_idx in range(max_cols):
            has_data = any(col_idx < len(row) and row[col_idx].strip() 
                          for row in rows_non_empty)
            if has_data:
                non_empty_cols.append(col_idx)
        
        # Nettoyer les données
        cleaned_rows = []
        for row in rows_non_empty:
            cleaned_row = [row[i] if i < len(row) else '' for i in non_empty_cols]
            cleaned_rows.append(cleaned_row)
        
        # Sauvegarder
        with open(output_file, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f, delimiter=';')
            writer.writerows(cleaned_rows)
        
        print(f" Sports nettoyés: {len(rows)} -> {len(cleaned_rows)} lignes, {len(non_empty_cols)} colonnes")
        return output_file
    
    def clean_variables_hierarchy(self):
        """Nettoie la hiérarchie des variables"""
        self.log("Nettoyage de la hiérarchie des variables", 3)
        
        input_file = self.data_csv_dir / 'Class-Hierarchy-V1.csv'
        output_file = self.data_csv_dir / 'Class-Hierarchy-V1-cleaned.csv'
        
        with open(input_file, 'r', encoding='utf-8-sig', newline='') as f:
            reader = csv.reader(f, delimiter=';')
            rows = list(reader)
        
        print(f"   Lignes originales: {len(rows)}")
        
        # Même logique que pour les sports mais en gardant plus de colonnes utiles
        rows_non_empty = [row for row in rows if any(cell.strip() for cell in row)]
        
        # Identifier colonnes avec données
        max_cols = max(len(row) for row in rows_non_empty) if rows_non_empty else 0
        non_empty_cols = []
        
        for col_idx in range(min(10, max_cols)):  # Limiter à 10 colonnes max
            has_data = any(col_idx < len(row) and row[col_idx].strip() 
                          for row in rows_non_empty)
            if has_data:
                non_empty_cols.append(col_idx)
        
        cleaned_rows = []
        for row in rows_non_empty:
            cleaned_row = [row[i] if i < len(row) else '' for i in non_empty_cols]
            cleaned_rows.append(cleaned_row)
        
        with open(output_file, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f, delimiter=';')
            writer.writerows(cleaned_rows)
        
        print(f" Variables nettoyées: {len(rows)} -> {len(cleaned_rows)} lignes, {len(non_empty_cols)} colonnes")
        return output_file
    
    def clean_main_data(self):
        """Nettoie le fichier principal IA-DAS-Data"""
        self.log("Nettoyage des données principales", 4)
        
        input_file = self.data_csv_dir / 'IA-DAS-Data.csv'
        output_file = self.data_csv_dir / 'IA-DAS-Data-cleaned.csv'
        
        with open(input_file, 'r', encoding='utf-8-sig', newline='') as f:
            reader = csv.reader(f, delimiter=';')
            rows = list(reader)
        
        print(f"   Lignes originales: {len(rows)}")
        print(f"   Colonnes originales: {len(rows[0]) if rows else 0}")
        
        # Supprimer lignes vides
        rows_non_empty = [row for row in rows if any(cell.strip() for cell in row)]
        
        # Identifier colonnes non vides
        num_cols = max(len(row) for row in rows_non_empty)
        non_empty_cols = []
        
        for col_idx in range(num_cols):
            has_data = any(col_idx < len(row) and row[col_idx].strip() 
                          for row in rows_non_empty)
            if has_data:
                non_empty_cols.append(col_idx)
        
        # Nettoyer
        cleaned_rows = []
        for row in rows_non_empty:
            cleaned_row = [row[i] if i < len(row) else '' for i in non_empty_cols]
            cleaned_rows.append(cleaned_row)
        
        with open(output_file, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f, delimiter=';')
            writer.writerows(cleaned_rows)
        
        print(f" Données principales nettoyées: {len(rows)} -> {len(cleaned_rows)} lignes, {len(non_empty_cols)} colonnes")
        return output_file
    
    def convert_separators(self):
        """Convertit les séparateurs ; en ,"""
        self.log("Conversion des séparateurs ; en ,", 5)
        
        files_to_convert = [
            'Sport-Hierarchy-cleaned.csv',
            'Class-Hierarchy-V1-cleaned.csv', 
            'IA-DAS-Data-cleaned.csv'
        ]
        
        for file_name in files_to_convert:
            input_file = self.data_csv_dir / file_name
            output_file = self.data_converted_dir / file_name
            
            if not input_file.exists():
                print(f"  Fichier ignoré (non trouvé): {file_name}")
                continue
                
            with open(input_file, 'r', encoding='utf-8', newline='') as f_in:
                reader = csv.reader(f_in, delimiter=';')
                with open(output_file, 'w', encoding='utf-8', newline='') as f_out:
                    writer = csv.writer(f_out, delimiter=',')
                    for row in reader:
                        writer.writerow(row)
            
            print(f" Converti: {file_name}")
    
    def create_unique_analysis_ids(self):
        """Crée des Analysis_IDs uniques"""
        self.log("Création d'Analysis_IDs uniques", 6)
        
        input_file = self.data_converted_dir / 'IA-DAS-Data-cleaned.csv'
        output_file = self.data_converted_dir / 'IA-DAS-Data-unique-ids.csv'
        
        with open(input_file, 'r', encoding='utf-8', newline='') as f:
            reader = csv.reader(f)
            rows = list(reader)
        
        headers = rows[0]
        data_rows = rows[1:]
        
        # Trouver colonne Analysis_ID
        analysis_id_index = None
        for i, header in enumerate(headers):
            if header.strip() == 'Analysis_ID':
                analysis_id_index = i
                break
        
        if analysis_id_index is None:
            raise Exception("Colonne 'Analysis_ID' non trouvée")
        
        # Créer IDs uniques
        analysis_id_counts = defaultdict(int)
        new_rows = []
        
        for row in data_rows:
            if len(row) > analysis_id_index and row[analysis_id_index].strip():
                original_id = row[analysis_id_index].strip()
                analysis_id_counts[original_id] += 1
                
                if analysis_id_counts[original_id] == 1:
                    new_id = original_id
                else:
                    new_id = f"{original_id}.{analysis_id_counts[original_id] - 1}"
                
                new_row = row.copy()
                new_row[analysis_id_index] = new_id
                new_rows.append(new_row)
            else:
                new_rows.append(row)
        
        with open(output_file, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(headers)
            writer.writerows(new_rows)
        
        total_unique = len([row[analysis_id_index] for row in new_rows 
                           if len(row) > analysis_id_index and row[analysis_id_index].strip()])
        
        print(f" Analysis_IDs uniques créés: {len(analysis_id_counts)} originaux -> {total_unique} uniques")
    
    def run_rml_mapping(self, mapping_file, output_file):
        """Exécute RMLMapper pour un mapping donné"""
        cmd = [
            'java', '-jar', str(self.jar_file),
            '-m', str(mapping_file),
            '-o', str(output_file)
        ]
        
        print(f"   Commande: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=self.base_dir)
        
        if result.returncode != 0:
            print(f" Erreur RMLMapper:")
            print(result.stderr)
            raise Exception(f"RMLMapper a échoué pour {mapping_file}")
        
        print(f" Ontologie générée: {output_file}")
    
    def generate_ontologies(self):
        """Génère toutes les ontologies"""
        self.log("Génération des ontologies avec RMLMapper", 7)
        
        # Sports
        self.run_rml_mapping(
            self.mapping_dir / 'mapping-sport.ttl',
            self.output_dir / 'sport-hierarchy.ttl'
        )
        
        # Variables  
        self.run_rml_mapping(
            self.mapping_dir / 'mapping-hierarchy.ttl',
            self.output_dir / 'variable-hierarchy.ttl'
        )
        
        # Ontologie principale
        self.run_rml_mapping(
            self.mapping_dir / 'mapping-ontology.ttl',
            self.output_dir / 'ia-das-ontology.ttl'
        )
    
    def clean_uris(self):
        """Nettoie les URIs (%20 -> _)"""
        self.log("Nettoyage des URIs (%20 -> _)", 8)
        
        files_to_clean = [
            'sport-hierarchy.ttl',
            'variable-hierarchy.ttl', 
            'ia-das-ontology.ttl'
        ]
        
        for file_name in files_to_clean:
            input_file = self.output_dir / file_name
            output_file = self.output_dir / file_name.replace('.ttl', '-clean.ttl')
            
            if not input_file.exists():
                print(f"  Fichier ignoré: {file_name}")
                continue
            
            # Utiliser sed pour le nettoyage (plus rapide)
            cmd = ['sed', 's/%20/_/g', str(input_file)]
            
            try:
                with open(output_file, 'w', encoding='utf-8') as f_out:
                    result = subprocess.run(cmd, stdout=f_out, text=True, shell=True)
                    
                if result.returncode == 0:
                    print(f" URIs nettoyées: {file_name}")
                else:
                    # Fallback Python si sed échoue
                    self._clean_uris_python(input_file, output_file)
                    
            except:
                # Fallback Python
                self._clean_uris_python(input_file, output_file)
    
    def _clean_uris_python(self, input_file, output_file):
        """Nettoyage URIs en Python (fallback)"""
        with open(input_file, 'r', encoding='utf-8') as f_in:
            content = f_in.read()
        
        cleaned_content = content.replace('%20', '_')
        
        with open(output_file, 'w', encoding='utf-8') as f_out:
            f_out.write(cleaned_content)
        
        print(f" URIs nettoyées (Python): {input_file.name}")
    
    def copy_final_files(self):
        """Copie les 3 fichiers TTL finaux vers le dossier resultats"""
        self.log("Copie des fichiers finaux", 9)
        
        # Mappage des fichiers à copier
        files_mapping = {
            'sport-hierarchy-clean.ttl': 'sport-hierarchy-simple-clean.ttl',
            'variable-hierarchy-clean.ttl': 'variable-hierarchy-clean.ttl',
            'ia-das-ontology-clean.ttl': 'ia-das-ontology-clean.ttl'
        }
        
        for source_name, target_name in files_mapping.items():
            source_file = self.output_dir / source_name
            target_file = self.results_dir / target_name
            
            if source_file.exists():
                shutil.copy2(source_file, target_file)
                print(f" Copié: {target_name}")
            else:
                print(f"  Fichier source non trouvé: {source_name}")
    
    def run_complete_pipeline(self):
        """Exécute le pipeline complet"""
        print(" DÉMARRAGE DU PIPELINE COMPLET IA-DAS ")
        
        try:
            # Vérification des prérequis
            if not self.check_prerequisites():
                print(" Pipeline arrêté - prérequis non satisfaits")
                return False
            
            # Nettoyage des données
            self.clean_sport_hierarchy()
            self.clean_variables_hierarchy() 
            self.clean_main_data()
            
            # Conversion des séparateurs
            self.convert_separators()
            
            # Création d'IDs uniques
            self.create_unique_analysis_ids()
            
            # Génération des ontologies
            self.generate_ontologies()
            
            # Nettoyage des URIs
            self.clean_uris()
            
            # Copie des fichiers finaux
            self.copy_final_files()
            
            # Résumé final
            self.log("PIPELINE TERMINÉ AVEC SUCCÈS !", "")
            print(f"""
 ONTOLOGIE IA-DAS GÉNÉRÉE AVEC SUCCÈS !

 Fichiers finaux dans le dossier 'resultats/':
   1. sport-hierarchy-simple-clean.ttl
   2. variable-hierarchy-clean.ttl  
   3. ia-das-ontology-clean.ttl

 Prêt pour Fuseki !
   - Charger les 3 fichiers dans l'ordre indiqué
   - Dataset prêt pour les requêtes SPARQL
   - {self._count_analyses()} analyses disponibles

 Prochaines étapes:
   1. Démarrer Fuseki : ./fuseki-server
   2. Créer dataset 'ia-das'
   3. Charger les 3 fichiers TTL
   4. Exécuter les requêtes de compétences
""")
            
            return True
            
        except Exception as e:
            print(f"\n ERREUR PIPELINE: {str(e)}")
            return False
    
    def _count_analyses(self):
        """Compte le nombre d'analyses dans l'ontologie finale"""
        try:
            ontology_file = self.results_dir / 'ia-das-ontology-clean.ttl'
            if ontology_file.exists():
                with open(ontology_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    count = content.count('rdf:type> <http://ia-das.org/onto#Analysis>')
                    return count
            return "?"
        except:
            return "?"


def main():
    """Fonction principale"""
    print("""
==================================================================
                    PIPELINE IA-DAS ONTOLOGIE                    
==================================================================
  Generation automatisee d'ontologie depuis Excel/CSV         
  Sports + Variables + Analyses completes                     
  Resultat: 3 fichiers TTL prets pour Fuseki                 
==================================================================
    """)
    
    # Initialiser et exécuter le pipeline
    pipeline = PipelineIADAS()
    success = pipeline.run_complete_pipeline()
    
    if success:
        print("\n Pipeline terminé avec succès !")
        return 0
    else:
        print("\n Pipeline échoué. Vérifiez les logs d'erreur ci-dessus.")
        return 1


if __name__ == "__main__":
    sys.exit(main())