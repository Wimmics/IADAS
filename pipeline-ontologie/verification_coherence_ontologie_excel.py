#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Verification de coherence : vocabulaire ACAD-vocab (ontologie/Fuseki)
                              vs taxonomie de reference (Excel Class_Hierarchy_VF)

Pour chaque chiffre affiche, le commentaire indique la SOURCE EXACTE
(requete SPARQL sur Fuseki, ou lecture Python du fichier Excel/TTL),
afin de pouvoir repondre a "tu t'es basee sur quoi ?" (Mme Molka).
"""

import json
import re
import urllib.request
import urllib.parse
import base64
from pathlib import Path
from collections import defaultdict

import openpyxl

FUSEKI = "http://localhost:3030/ds/sparql"
PREFIX = """
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
"""

BASE_DIR = Path(__file__).resolve().parent           # pipeline-ontologie/
RML_OUTPUT = BASE_DIR / "output" / "variable-hierarchy.ttl"
RML_OUTPUT_CLEAN = BASE_DIR / "output" / "variable-hierarchy-clean.ttl"
ENRICHMENT_TTL = BASE_DIR / "skos-acad-enrichment.ttl"
EXCEL_HIERARCHY = BASE_DIR.parent.parent / "Class_Hierarchy_VF_09avr26xlsx.xlsx"


def sparql(q):
    data = ("query=" + urllib.parse.quote(PREFIX + q)).encode()
    req = urllib.request.Request(FUSEKI, data=data, method="POST")
    req.add_header("Accept", "application/sparql-results+json")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    auth = base64.b64encode(b"admin:admin").decode()
    req.add_header("Authorization", "Basic " + auth)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def count(q):
    return int(sparql(q)["results"]["bindings"][0]["n"]["value"])


print("=" * 70)
print("  VERIFICATION COHERENCE ONTOLOGIE <-> EXCEL  (vocabulaire ACAD)")
print("=" * 70)

# -----------------------------------------------------------------------
# 1. Taille totale du vocabulaire dans l'ontologie (Fuseki)
# -----------------------------------------------------------------------
total_ontologie = count("""
SELECT (COUNT(*) AS ?n) WHERE {
  ?c a skos:Concept .
  FILTER(CONTAINS(STR(?c), 'ACAD-vocab'))
}
""")
print(f"\n[1] Total concepts ontologie (Fuseki, 'a skos:Concept', ACAD-vocab) = {total_ontologie}")
print("    Source : SPARQL sur Fuseki")

# -----------------------------------------------------------------------
# 2. Decomposition : pipeline RML brut (variable-hierarchy.ttl)
# -----------------------------------------------------------------------
rml_count = 0
if RML_OUTPUT.exists():
    with open(RML_OUTPUT, encoding="utf-8") as f:
        for line in f:
            if "rdf-syntax-ns#type> <http://www.w3.org/2004/02/skos/core#Concept>" in line:
                rml_count += 1
print(f"\n[2] Concepts generes par le pipeline RML (output/variable-hierarchy.ttl) = {rml_count}")
print(f"    Source : comptage Python sur {RML_OUTPUT.relative_to(BASE_DIR.parent)}")

# -----------------------------------------------------------------------
# 3. Decomposition : enrichissement manuel (skos-acad-enrichment.ttl)
# -----------------------------------------------------------------------
enrich_count = 0
if ENRICHMENT_TTL.exists():
    with open(ENRICHMENT_TTL, encoding="utf-8") as f:
        for line in f:
            if re.match(r"^iadas-vocab:\S+ a skos:Concept", line):
                enrich_count += 1
print(f"\n[3] Concepts ajoutes manuellement (skos-acad-enrichment.ttl) = {enrich_count}")
print(f"    Source : comptage Python sur {ENRICHMENT_TTL.relative_to(BASE_DIR.parent)}")

print(f"\n    => {rml_count} (RML) + {enrich_count} (manuel) = {rml_count + enrich_count}"
      f"  {'OK' if rml_count + enrich_count == total_ontologie else '(brut, voir [3bis] pour le chevauchement)'}")

# -----------------------------------------------------------------------
# 3bis. Chevauchement RML <-> enrichissement (memes URIs apres %20->_ )
#       L'enrichissement re-declare 'a skos:Concept' pour des concepts deja
#       crees par le RML (pour y ajouter skos:broader/narrower/exactMatch...)
# -----------------------------------------------------------------------
rml_clean_uris = set()
if RML_OUTPUT_CLEAN.exists():
    with open(RML_OUTPUT_CLEAN, encoding="utf-8") as f:
        for line in f:
            if "rdf-syntax-ns#type> <http://www.w3.org/2004/02/skos/core#Concept>" in line:
                uri = line.split(">")[0].lstrip("<")
                rml_clean_uris.add(uri.split("/")[-1])

enrich_uris = set()
if ENRICHMENT_TTL.exists():
    with open(ENRICHMENT_TTL, encoding="utf-8") as f:
        for line in f:
            m = re.match(r"^iadas-vocab:(\S+) a skos:Concept", line)
            if m:
                enrich_uris.add(m.group(1))

overlap = rml_clean_uris & enrich_uris
union_count = len(rml_clean_uris | enrich_uris)
print(f"\n[3bis] Chevauchement RML (clean) <-> enrichissement (memes URIs, apres %20->_) = {len(overlap)}")
print(f"     Source : comptage Python sur output/variable-hierarchy-clean.ttl + skos-acad-enrichment.ttl")
print(f"     => {len(rml_clean_uris)} (RML clean) + {enrich_count} (manuel) - {len(overlap)} (chevauchement)"
      f" = {union_count}"
      f"  {'OK, correspond a [1]' if union_count == total_ontologie else '!! NE CORRESPOND PAS A [1] !!'}")

# -----------------------------------------------------------------------
# 4. Taxonomie de reference Excel (Class_Hierarchy_VF)
# -----------------------------------------------------------------------
excel_leaves = set()
excel_rows = 0
if EXCEL_HIERARCHY.exists():
    wb = openpyxl.load_workbook(EXCEL_HIERARCHY, data_only=True)
    ws = wb["Hierarchy"]
    for row in ws.iter_rows(min_row=2, values_only=True):
        cells = [c for c in row[1:7] if c is not None and str(c).strip() != ""]
        if not cells:
            continue
        excel_rows += 1
        # Meme nettoyage que clean_text() dans generate_hierarchy_from_vf.py (espace
        # insecable -> espace normal, espaces doubles -> simple) : sans ca, le xlsx VF
        # brut ne matche jamais l'ontologie sur "External ingestion"/"Extrinsic
        # regulation for sport", qui sont pourtant deja nettoyes cote pipeline.
        leaf = str(cells[-1]).replace("\xa0", " ")
        leaf = re.sub(r" {2,}", " ", leaf).strip().lower()
        excel_leaves.add(leaf)
print(f"\n[4] Taxonomie Excel '{EXCEL_HIERARCHY.name}' (feuille Hierarchy)")
print(f"    Lignes non vides = {excel_rows}, concepts distincts (case-insensitive) = {len(excel_leaves)}")
print(f"    Source : openpyxl sur {EXCEL_HIERARCHY.relative_to(EXCEL_HIERARCHY.parent.parent)}")

# -----------------------------------------------------------------------
# 5. Concepts reellement mobilises (utilises comme VI ou VD)
# -----------------------------------------------------------------------
d = sparql("""
SELECT DISTINCT ?c WHERE {
  { ?vi iadas:refersToVariable ?c . ?rel iadas:hasIndependentVariable ?vi }
  UNION
  { ?vd iadas:refersToVariable ?c . ?rel iadas:hasDependentVariable ?vd }
}
""")
mobilises_uris = [b["c"]["value"] for b in d["results"]["bindings"]]
print(f"\n[5] Concepts mobilises (refersToVariable via VI ou VD) = {len(mobilises_uris)}")
print("    Source : SPARQL sur Fuseki (DISTINCT ?c)")

# -----------------------------------------------------------------------
# 6. Divergences ontologie (778 labels) <-> Excel (616 labels)
# -----------------------------------------------------------------------
d = sparql("""
SELECT ?c ?label WHERE {
  ?c a skos:Concept ; skos:prefLabel ?label .
  FILTER(CONTAINS(STR(?c), 'ACAD-vocab'))
}
""")
ontology_labels = {b["label"]["value"].strip().lower() for b in d["results"]["bindings"]}
print(f"\n[6] Labels ontologie (skos:prefLabel, ACAD-vocab) = {len(ontology_labels)}")

only_ontology = ontology_labels - excel_leaves
only_excel = excel_leaves - ontology_labels
inter = ontology_labels & excel_leaves

print(f"\n    Intersection (presents des deux cotes)            = {len(inter)}")
print(f"    Dans l'ontologie mais ABSENT de l'Excel            = {len(only_ontology)}")
print(f"    Dans l'Excel mais ABSENT de l'ontologie            = {len(only_excel)}")

# -----------------------------------------------------------------------
# 7. Quasi-doublons : labels identiques (hors casse/espaces) -> plusieurs URIs
#    (778 URIs mais seulement 746 labels distincts => doublons)
# -----------------------------------------------------------------------
d = sparql("""
SELECT ?c ?label WHERE {
  ?c a skos:Concept ; skos:prefLabel ?label .
  FILTER(CONTAINS(STR(?c), 'ACAD-vocab'))
}
""")
groups = defaultdict(list)
for b in d["results"]["bindings"]:
    key = b["label"]["value"].strip().lower()
    groups[key].append((b["c"]["value"].split("/")[-1], b["label"]["value"]))

dups = {k: v for k, v in groups.items() if len(v) > 1}
print(f"\n[7] Quasi-doublons (meme label hors casse/espaces, plusieurs URIs) = {len(dups)} groupes")
print(f"    {sum(len(v) for v in dups.values())} URIs concernees au total"
      f" ({total_ontologie - len(ontology_labels)} URIs 'en trop')")
print("    Source : SPARQL Fuseki, regroupement Python par label.lower().strip()")
for k, v in dups.items():
    uris = ", ".join(f"{name!r} (label={label!r})" for name, label in v)
    print(f"      - {uris}")

# -----------------------------------------------------------------------
# Tableau recapitulatif
# -----------------------------------------------------------------------
print("\n" + "=" * 70)
print("  RECAPITULATIF")
print("=" * 70)
print(f"  {'Total ontologie (vocabulaire ACAD complet)':<50} {total_ontologie:>6}")
print(f"  {'  dont pipeline RML (output/variable-hierarchy.ttl)':<50} {rml_count:>6}")
print(f"  {'  dont enrichissement manuel (skos-acad-enrichment.ttl)':<50} {enrich_count:>6}")
print(f"  {'Taxonomie Excel (Class_Hierarchy_VF, feuille Hierarchy)':<50} {len(excel_leaves):>6}")
print(f"  {'Concepts mobilises (>=1 analyse, VI ou VD)':<50} {len(mobilises_uris):>6}")
print(f"  {'Labels ontologie absents de l excel':<50} {len(only_ontology):>6}")
print(f"  {'Labels excel absents de l ontologie':<50} {len(only_excel):>6}")
print("=" * 70)
