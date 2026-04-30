#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import re
from pathlib import Path

def clean_ttl_uris(input_file, output_file):
    """
    Nettoie les URIs dans un fichier TTL en remplaçant les espaces encodés
    par des identifiants propres (CamelCase)
    """
    print(f"Nettoyage des URIs dans: {input_file}")
    
    # Lire le fichier
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Dictionnaire pour stocker les remplacements
    replacements = {}
    
    # Trouver tous les URIs avec %20 (format complet et préfixé)
    # Format complet : <http://ia-das.org/onto#Something%20else>
    pattern_full = r'<(http://ia-das\.org/onto#[^>]+)>'
    # Format préfixé : iadas:Something%20else
    pattern_prefix = r'iadas:([^>\s]+)'
    
    matches_full = re.findall(pattern_full, content)
    matches_prefix = re.findall(pattern_prefix, content)
    
    # Traiter les URIs complètes
    for match in matches_full:
        if '%20' in match:
            clean_uri = match.replace('%20', '_')
            replacements[f'<{match}>'] = f'<{clean_uri}>'
    
    # Traiter les URIs préfixées
    for match in matches_prefix:
        if '%20' in match:
            clean_name = match.replace('%20', '_')
            replacements[f'iadas:{match}'] = f'iadas:{clean_name}'
    
    # Appliquer les remplacements
    result = content
    for old, new in replacements.items():
        result = result.replace(old, new)
    
    # Écrire le fichier nettoyé
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(result)
    
    print(f"Fichier nettoyé créé: {output_file}")
    print(f"Nombre d'URIs nettoyées: {len(replacements)}")
    
    # Afficher quelques exemples
    if replacements:
        print("\nExemples de nettoyage:")
        for old, new in list(replacements.items())[:5]:
            print(f"  {old} -> {new}")

def clean_all_ttl_files():
    """
    Nettoie tous les fichiers TTL dans le dossier output
    """
    output_dir = Path('output')
    
    for ttl_file in output_dir.glob('*.ttl'):
        if not ttl_file.name.endswith('-clean.ttl'):
            output_file = ttl_file.parent / f"{ttl_file.stem}-clean.ttl"
            clean_ttl_uris(ttl_file, output_file)

if __name__ == "__main__":
    clean_all_ttl_files()