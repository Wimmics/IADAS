"""
Renomme les colonnes du nouveau fichier d'extraction (17.06.2026)
pour correspondre aux noms attendus par le pipeline RML existant.
"""
import csv, pathlib, shutil

SRC = pathlib.Path(__file__).parent / 'data-csv' / 'IA-DAS-Data.csv'
BCK = pathlib.Path(__file__).parent / 'data-csv' / 'IA-DAS-Data-new-original.csv'

# Sauvegarde
shutil.copy(SRC, BCK)
print(f'Backup: {BCK}')

RENAME = {
    'Analysis ID':                     'Analysis_ID',
    'Article ID ':                     'Code',
    'Article ID':                      'Code',
    'Year ':                           'Year',
    'Sport name':                      'Sport_name',
    'DSM classification':              'ACADS',
    'DEAB':                            'VD',
    'Specifications of DEAB':          'Specification VD',
    'DEAB measure':                    'Measure_VD',
    'DEAB_CLASS':                      'VD_CLASS',
    'DEAB_sub-class 1':                'VD_sub-class 1',
    'DEAB_sub-class 2':                'VD_sub-class 2',
    'DEAB_sub-class 3':                'VD_sub-class 3',
    'DEAB_final sub-class':            'VD_final_sub-class',
    'Related_Factor':                  'VI',
    'Specifications of related factor':'Specification VI',
    'Related_Factor measure':          'Measure_VI',
    'Related_Factor_CLASS':            'VI_CLASS',
    'Related_Factor_sub-class 1':      'VI_sub-class 1',
    'Related_Factor_sub-class 2':      'VI_sub-class 2',
    'Related_Factor_sub-class 3':      'VI_sub-class 3',
    'Related_Factor_sub-class 4':      'VI_sub-class 4',
    'Related_Factor_sub-class 5':      'VI_sub-class 5',
    'Related_Factor_final sub-class':  'VI_final_sub-class',
}

with open(SRC, encoding='utf-8', newline='') as f:
    reader = csv.reader(f, delimiter=';')
    headers = next(reader)
    rows = list(reader)

new_headers = [RENAME.get(h.strip(), h.strip()) for h in headers]

print('Colonnes renommees:')
for old, new in zip(headers, new_headers):
    if old.strip() != new:
        print(f'  {repr(old.strip())} -> {repr(new)}')

with open(SRC, 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f, delimiter=';')
    writer.writerow(new_headers)
    writer.writerows(rows)

print(f'\nFichier mis a jour: {SRC}')
print(f'Headers finaux (premiers 10): {new_headers[:10]}')
