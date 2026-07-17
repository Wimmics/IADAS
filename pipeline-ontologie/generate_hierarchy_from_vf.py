# -*- coding: utf-8 -*-
"""
Genere Class-Hierarchy-V1-from-VF.csv depuis le fichier officiel
Class_Hierarchy_VF_09avr26xlsx.xlsx, dans le meme format que Class-Hierarchy-V1.csv
(memes en-tetes, meme delimiteur ';', meme encodage), pour que le pipeline existant
(clean_variables_hierarchy -> convert_separators -> mapping RML) fonctionne sans
aucune modification.

Ne touche PAS au fichier Class-Hierarchy-V1.csv actuel : ecrit un fichier separe
pour permettre une comparaison avant remplacement.

Les colonnes d'analyse absentes de VF (Modification proposee, NB DE RELATIONS...,
DOI Distincts, Outils, Autres outils) sont preservees en les rattachant au concept
correspondant de l'ancien V1 (matching par label de la feuille = derniere colonne
non vide, normalise). Si un concept est nouveau (n'existait pas dans V1), ces
colonnes restent vides.
"""
import csv
import re
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent
VF_XLSX = Path(r"C:\Users\core solutions\Desktop\Stage\Ressources\Last_year_stagiaire_work\Class_Hierarchy_VF_09avr26xlsx.xlsx")
V1_OLD = BASE / "data-csv" / "Class-Hierarchy-V1-TRUE-ORIGINAL.csv"
OUT = BASE / "data-csv" / "Class-Hierarchy-V1-from-VF.csv"

HEADER = [
    "CLASS", "sub-class 1", "sub-class 2", "sub-class 3", "sub-class 4", "sub-class 5",
    "Synonym", "Modification proposée",
    "NB DE RELATIONS POSITIVE (Facteurs de risque)",
    "NB DE RELATIONS NEGATIVES (Facteurs protecteurs)",
    "NB DE RELATIONS NS", "Relations Flous", "DOI Distincts",
    "Définition", "Outils", "Autres outils utilisés pour ces variables",
]

VF_LEVELS = ["CLASS", "Sub-class 1", "Sub-class 2", "Sub-class 3", "Sub-class 4", "Sub-class 5"]
V1_LEVELS = ["CLASS", "sub-class 1", "sub-class 2", "sub-class 3", "sub-class 4", "sub-class 5"]

EXTRA_COLS = [
    "Modification proposée",
    "NB DE RELATIONS POSITIVE (Facteurs de risque)",
    "NB DE RELATIONS NEGATIVES (Facteurs protecteurs)",
    "NB DE RELATIONS NS", "Relations Flous", "DOI Distincts",
    "Outils", "Autres outils utilisés pour ces variables",
]


def norm(s):
    s = str(s).strip().lower().replace("-", " ")
    return re.sub(r"\s+", " ", s)


def clean_text(s):
    """Nettoyage des valeurs VF avant ecriture : espace insecable -> espace normal,
    espaces doubles -> simple. Corrige les regressions observees lors du test
    (ex: 'External  ingestion' avec 2 espaces, 'Extrinsic regulation\xa0for sport'
    avec espace insecable) par rapport aux corrections deja appliquees dans V1."""
    if s is None:
        return ""
    s = str(s).replace("\xa0", " ")
    s = re.sub(r" {2,}", " ", s)
    return s.strip()


# Corrections ponctuelles deja appliquees manuellement dans V1 (voir historique Git,
# commit 7426cf0 "corriger problemes de casse") mais absentes du fichier VF officiel.
# Pas une regle generique (la casse de la hierarchie n'est pas uniforme, ex. "Weight
# Control" vs "Body appreciation" - une regle automatique casserait plus qu'elle ne
# corrigerait). A completer manuellement si le test de comparaison OLD/NEW en
# detecte d'autres lors d'un futur envoi de VF.
KNOWN_TEXT_OVERRIDES = {
    "muscularity oriented eating": "Muscularity oriented eating",
}


def apply_known_overrides(s):
    return KNOWN_TEXT_OVERRIDES.get(s, s)


# --- 1. Charger les colonnes d'analyse de l'ancien V1, indexees par CHEMIN COMPLET ---
# (pas juste le label final : plusieurs concepts differents peuvent partager le meme
# nom de feuille sous des parents differents, ex. "Weight control", "Body appreciation")
old_extra = {}
old_definition = {}
with open(V1_OLD, encoding="utf-8-sig") as f:
    for row in csv.DictReader(f, delimiter=";"):
        path_vals = [row.get(c, "").strip() for c in V1_LEVELS if row.get(c, "").strip()]
        if not path_vals:
            continue
        key = tuple(norm(p) for p in path_vals)
        old_extra[key] = {c: row.get(c, "").strip() for c in EXTRA_COLS}
        old_definition[key] = row.get("Définition", "").strip()

print(f"Concepts avec donnees d'analyse recuperees depuis l'ancien V1 : {len(old_extra)}")

# --- 2. Lire VF et construire les nouvelles lignes ---
vf_df = pd.read_excel(VF_XLSX, sheet_name="Hierarchy")

new_rows = []
matched_extra = 0
for _, row in vf_df.iterrows():
    path = [row.get(c) for c in VF_LEVELS]
    path = [apply_known_overrides(clean_text(p)) for p in path if pd.notna(p) and clean_text(p)]
    if not path:
        continue

    # Securite : un niveau ne peut jamais etre son propre parent direct. Sans ca, une
    # ligne VF avec une valeur repetee a deux niveaux consecutifs (erreur de saisie,
    # ex. "...Body image dissatisfaction / Body image dissatisfaction") cree un concept
    # qui se reference lui-meme (skos:broader vers soi-meme) -> cycle detecte par le
    # bandeau qualite de l'interface. Regle generique et sans risque : un doublon
    # consecutif est toujours une erreur, jamais une intention valide dans une hierarchie.
    deduped_path = [path[0]]
    for p in path[1:]:
        if norm(p) != norm(deduped_path[-1]):
            deduped_path.append(p)
    path = deduped_path
    path_key = tuple(norm(p) for p in path)

    synonym = row.get("Synonym")
    synonym_str = clean_text(synonym) if pd.notna(synonym) else ""

    definition_vf = row.get("Definition")
    definition_str = clean_text(definition_vf) if pd.notna(definition_vf) else ""
    if not definition_str:
        definition_str = old_definition.get(path_key, "")

    extra = old_extra.get(path_key)
    if extra:
        matched_extra += 1
    else:
        extra = {c: "" for c in EXTRA_COLS}

    new_row = {c: "" for c in HEADER}
    for i, level_name in enumerate(V1_LEVELS):
        if i < len(path):
            new_row[level_name] = path[i]
    new_row["Synonym"] = synonym_str
    new_row["Définition"] = definition_str
    for c in EXTRA_COLS:
        new_row[c] = extra[c]
    new_rows.append(new_row)

print(f"Lignes generees depuis VF : {len(new_rows)}")
print(f"  dont avec donnees d'analyse recuperees (match avec ancien V1) : {matched_extra}")
print(f"  dont nouveaux concepts (pas de donnees d'analyse anterieures) : {len(new_rows) - matched_extra}")

# --- 3. Ecrire le fichier ---
with open(OUT, "w", encoding="utf-8-sig", newline="") as f:
    writer = csv.writer(f, delimiter=";")
    writer.writerow(HEADER)
    for r in new_rows:
        writer.writerow([r[c] for c in HEADER])

print(f"\nEcrit : {OUT}")
print("(fichier separe, Class-Hierarchy-V1.csv actuel non modifie)")
