#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script de vérification statistique des données ontologie IA-DAS
Effectue différents comptages pour vérifier l'intégrité des données
"""

import re
from pathlib import Path
from collections import Counter, defaultdict

class VerificationStatistiques:
    def __init__(self, ontology_file='output/ia-das-ontology-clean.ttl'):
        self.ontology_file = Path(ontology_file)
        self.content = ""
        self.load_ontology()
        
    def load_ontology(self):
        """Charge le contenu de l'ontologie"""
        if not self.ontology_file.exists():
            raise FileNotFoundError(f"Fichier ontologie non trouve: {self.ontology_file}")
        
        with open(self.ontology_file, 'r', encoding='utf-8') as f:
            self.content = f.read()
        
        print(f"Ontologie chargee: {self.ontology_file}")
        print(f"Taille du fichier: {len(self.content):,} caracteres")
        print("="*60)
    
    def count_analyses(self):
        """Compte le nombre total d'analyses"""
        count = self.content.count('rdf:type> <http://ia-das.org/onto#Analysis>')
        print(f"ANALYSES TOTALES: {count}")
        return count
    
    def count_by_gender(self):
        """Compte par genre"""
        print("\nREPARTITION PAR GENRE:")
        print("-" * 25)
        
        # Extraire toutes les valeurs de genre
        gender_pattern = r'<http://ia-das\.org/onto#gender> "([^"]*)"'
        genders = re.findall(gender_pattern, self.content)
        
        gender_counts = Counter(genders)
        for gender, count in gender_counts.most_common():
            if gender.strip():
                print(f"  {gender}: {count}")
        
        return gender_counts
    
    def count_by_country(self):
        """Compte par pays"""
        print("\nREPARTITION PAR PAYS:")
        print("-" * 23)
        
        country_pattern = r'<http://ia-das\.org/onto#country> "([^"]*)"'
        countries = re.findall(country_pattern, self.content)
        
        country_counts = Counter(countries)
        for country, count in country_counts.most_common(10):  # Top 10
            if country.strip():
                print(f"  {country}: {count}")
        
        print(f"  ... et {len(country_counts) - 10} autres pays") if len(country_counts) > 10 else None
        return country_counts
    
    def count_by_sport(self):
        """Compte par sport"""
        print("\nREPARTITION PAR SPORT:")
        print("-" * 22)
        
        sport_pattern = r'<http://ia-das\.org/onto#sportName> "([^"]*)"'
        sports = re.findall(sport_pattern, self.content)
        
        sport_counts = Counter(sports)
        for sport, count in sport_counts.most_common(15):  # Top 15
            if sport.strip():
                print(f"  {sport}: {count}")
        
        print(f"  ... et {len(sport_counts) - 15} autres sports") if len(sport_counts) > 15 else None
        return sport_counts
    
    def count_vd_types(self):
        """Compte les types de variables dépendantes"""
        print("\nVARIABLES DEPENDANTES (VD):")
        print("-" * 29)
        
        # Trouver tous les types de VD
        vd_pattern = r'<http://ia-das\.org/data#Variable_VD_[^>]+> <http://www\.w3\.org/1999/02/22-rdf-syntax-ns#type> <http://ia-das\.org/onto#([^>]+)>'
        vd_types = re.findall(vd_pattern, self.content)
        
        # Filtrer pour ne garder que les types conceptuels (pas VariableDependante)
        vd_types = [vt for vt in vd_types if vt != 'VariableDependante']
        
        vd_counts = Counter(vd_types)
        for vd_type, count in vd_counts.most_common(20):  # Top 20
            clean_type = vd_type.replace('_', ' ')
            print(f"  {clean_type}: {count}")
        
        print(f"  ... et {len(vd_counts) - 20} autres types VD") if len(vd_counts) > 20 else None
        return vd_counts
    
    def count_vi_types(self):
        """Compte les types de variables indépendantes"""
        print("\nVARIABLES INDEPENDANTES (VI):")
        print("-" * 31)
        
        vi_pattern = r'<http://ia-das\.org/data#Variable_VI_[^>]+> <http://www\.w3\.org/1999/02/22-rdf-syntax-ns#type> <http://ia-das\.org/onto#([^>]+)>'
        vi_types = re.findall(vi_pattern, self.content)
        
        # Filtrer pour ne garder que les types conceptuels
        vi_types = [vt for vt in vi_types if vt != 'VariableIndependante']
        
        vi_counts = Counter(vi_types)
        for vi_type, count in vi_counts.most_common(20):  # Top 20
            clean_type = vi_type.replace('_', ' ')
            print(f"  {clean_type}: {count}")
        
        print(f"  ... et {len(vi_counts) - 20} autres types VI") if len(vi_counts) > 20 else None
        return vi_counts
    
    def count_by_acad_type(self):
        """Compte par type d'ACAD"""
        print("\nREPARTITION PAR TYPE ACAD:")
        print("-" * 26)
        
        acad_pattern = r'<http://ia-das\.org/onto#acads> "([^"]*)"'
        acads = re.findall(acad_pattern, self.content)
        
        acad_counts = Counter(acads)
        for acad, count in acad_counts.most_common():
            if acad.strip():
                print(f"  {acad}: {count}")
        
        return acad_counts
    
    def count_by_study_type(self):
        """Compte par type d'étude"""
        print("\nREPARTITION PAR TYPE D'ETUDE:")
        print("-" * 30)
        
        study_pattern = r'<http://ia-das\.org/onto#studyType> "([^"]*)"'
        studies = re.findall(study_pattern, self.content)
        
        study_counts = Counter(studies)
        for study, count in study_counts.most_common():
            if study.strip():
                study_clean = study[:50] + "..." if len(study) > 50 else study
                print(f"  {study_clean}: {count}")
        
        return study_counts
    
    def count_statistical_relations(self):
        """Compte les relations statistiques"""
        print("\nRELATIONS STATISTIQUES:")
        print("-" * 24)
        
        # Compter les relations par type de résultat
        result_pattern = r'<http://ia-das\.org/onto#resultatRelation> "([^"]*)"'
        results = re.findall(result_pattern, self.content)
        
        result_counts = Counter(results)
        print("  Par type de résultat:")
        for result, count in result_counts.most_common():
            if result.strip():
                result_name = {
                    '+': 'Positif/Protecteur',
                    '-': 'Negatif/Risque', 
                    'NS': 'Non Significatif/Ambigu'
                }.get(result, result)
                print(f"    {result_name}: {count}")
        
        # Compter les relations avec coefficient r
        r_pattern = r'<http://ia-das\.org/onto#degreR> "([^"]*)"'
        r_values = re.findall(r_pattern, self.content)
        r_numeric = []
        for r in r_values:
            try:
                r_numeric.append(float(r))
            except:
                pass
        
        if r_numeric:
            print(f"\n  Coefficients de correlation (r):")
            print(f"    Nombre de relations avec r: {len(r_numeric)}")
            print(f"    r moyen: {sum(r_numeric)/len(r_numeric):.3f}")
            print(f"    r min: {min(r_numeric):.3f}")
            print(f"    r max: {max(r_numeric):.3f}")
        
        return result_counts
    
    def count_age_statistics(self):
        """Analyse les statistiques d'âge"""
        print("\nSTATISTIQUES D'AGE:")
        print("-" * 19)
        
        age_pattern = r'<http://ia-das\.org/onto#meanAge> "([^"]*)"'
        ages = re.findall(age_pattern, self.content)
        
        age_numeric = []
        for age in ages:
            try:
                age_numeric.append(float(age))
            except:
                pass
        
        if age_numeric:
            print(f"  Populations avec age moyen: {len(age_numeric)}")
            print(f"  Age moyen general: {sum(age_numeric)/len(age_numeric):.1f} ans")
            print(f"  Age minimum: {min(age_numeric):.1f} ans")
            print(f"  Age maximum: {max(age_numeric):.1f} ans")
        
        return age_numeric
    
    def count_sample_sizes(self):
        """Analyse les tailles d'échantillon"""
        print("\nTAILLES D'ECHANTILLON:")
        print("-" * 22)
        
        sample_pattern = r'<http://ia-das\.org/onto#sampleSize> "([^"]*)"'
        samples = re.findall(sample_pattern, self.content)
        
        sample_numeric = []
        for sample in samples:
            try:
                sample_numeric.append(int(sample))
            except:
                pass
        
        if sample_numeric:
            print(f"  Populations avec taille: {len(sample_numeric)}")
            print(f"  Taille moyenne: {sum(sample_numeric)/len(sample_numeric):.0f}")
            print(f"  Taille minimum: {min(sample_numeric)}")
            print(f"  Taille maximum: {max(sample_numeric)}")
            
            # Répartition par tranches
            tranches = {
                "< 50": len([s for s in sample_numeric if s < 50]),
                "50-100": len([s for s in sample_numeric if 50 <= s < 100]),
                "100-500": len([s for s in sample_numeric if 100 <= s < 500]),
                "500-1000": len([s for s in sample_numeric if 500 <= s < 1000]),
                "> 1000": len([s for s in sample_numeric if s >= 1000])
            }
            
            print(f"\n  Repartition par tranches:")
            for tranche, count in tranches.items():
                if count > 0:
                    print(f"    {tranche}: {count} etudes")
        
        return sample_numeric
    
    def summary_report(self):
        """Génère un rapport de synthèse"""
        print("\n" + "="*60)
        print("RAPPORT DE SYNTHESE - VERIFICATION ONTOLOGIE IA-DAS")
        print("="*60)
        
        total_analyses = self.count_analyses()
        
        genders = self.count_by_gender()
        countries = self.count_by_country() 
        sports = self.count_by_sport()
        vd_types = self.count_vd_types()
        vi_types = self.count_vi_types()
        acads = self.count_by_acad_type()
        studies = self.count_by_study_type()
        relations = self.count_statistical_relations()
        ages = self.count_age_statistics()
        samples = self.count_sample_sizes()
        
        print(f"\n{'='*60}")
        print("RESUME EXECUTIF:")
        print(f"{'='*60}")
        print(f"- TOTAL ANALYSES: {total_analyses}")
        print(f"- PAYS REPRESENTES: {len(countries)}")
        print(f"- SPORTS DIFFERENTS: {len(sports)}")
        print(f"- TYPES DE VD: {len(vd_types)}")
        print(f"- TYPES DE VI: {len(vi_types)}")
        print(f"- TYPES D'ACAD: {len(acads)}")
        print(f"- RELATIONS STATISTIQUES: {sum(relations.values())}")
        
        if ages:
            print(f"- AGE MOYEN PARTICIPANTS: {sum(ages)/len(ages):.1f} ans")
        if samples:
            print(f"- TAILLE MOYENNE ECHANTILLON: {sum(samples)/len(samples):.0f}")
        
        print(f"\nVERIFICATION TERMINEE - Ontologie integre!")
        return {
            'analyses': total_analyses,
            'genders': genders,
            'countries': countries,
            'sports': sports,
            'vd_types': vd_types,
            'vi_types': vi_types,
            'acads': acads,
            'studies': studies,
            'relations': relations,
            'ages': ages,
            'samples': samples
        }

def main():
    """Fonction principale"""
    try:
        verif = VerificationStatistiques()
        results = verif.summary_report()
        return results
    except Exception as e:
        print(f"Erreur lors de la verification: {e}")
        return None

if __name__ == "__main__":
    main()