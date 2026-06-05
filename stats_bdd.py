"""
Script de statistiques BDD IADAS
Usage : python stats_bdd.py
"""

import urllib.request
import urllib.parse
import json
from datetime import datetime

FUSEKI = "http://localhost:3030/ds/sparql"

def query(sparql):
    params = urllib.parse.urlencode({"query": sparql})
    url = f"{FUSEKI}?{params}"
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "Authorization": "Basic " + __import__("base64").b64encode(b"admin:admin").decode()
    })
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def count(sparql):
    d = query(sparql)
    return int(d["results"]["bindings"][0]["n"]["value"])

PREFIX = """
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX bibo: <http://purl.org/ontology/bibo/>
PREFIX dct: <http://purl.org/dc/terms/>
"""

FILTER_SIMPLES   = '?c = "Simple analyses" || ?c = "simple analyses"'
FILTER_COMPLEXES = '?c = "Complex analyses"'

print("=" * 55)
print(f"  STATS BDD IADAS — {datetime.now().strftime('%d/%m/%Y %H:%M')}")
print("=" * 55)

# --- Articles ---
print("\n  ARTICLES")
print("  " + "-" * 40)
articles_uniques   = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?title) AS ?n) WHERE {{ ?a a iadas:SportPsychologyArticle ; dct:title ?title }}")
analyses_total     = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE {{ ?x a iadas:Analysis }}")
analyses_simples   = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE {{ ?x a iadas:Analysis ; iadas:complexityOfAnalysis ?c . FILTER({FILTER_SIMPLES}) }}")
analyses_complexes = analyses_total - analyses_simples
print(f"  {'Articles uniques (titres distincts)':<35} {articles_uniques:>6}")
print(f"  {'Analyses (total)':<35} {analyses_total:>6}")
print(f"  {'Analyses simples':<35} {analyses_simples:>6}")
print(f"  {'Analyses complexes':<35} {analyses_complexes:>6}")

# --- Autres classes ---
print("\n  AUTRES CLASSES")
print("  " + "-" * 40)
for cls, label in [
    ("Population", "Populations"),
    ("Relations",  "Relations"),
]:
    n = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE {{ ?x a iadas:{cls} }}")
    print(f"  {label:<35} {n:>6}")

# --- Triples total ---
total = count("SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }")
print(f"\n  {'Triples total':<35} {total:>6}")

# --- Catégorisation VI ---
print("\n  CATEGORISATION VI")
print("  " + "-" * 40)
vi_total  = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?v) AS ?n) WHERE {{ ?v a iadas:VariableIndependante }}")
vi_na     = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?v) AS ?n) WHERE {{ ?v a iadas:VariableIndependante ; iadas:refersToVariable ?c . FILTER(CONTAINS(STR(?c),'N.A')) }}")
vi_cat    = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?v) AS ?n) WHERE {{ ?v a iadas:VariableIndependante ; iadas:refersToVariable ?c . ?c skos:broader ?b }}")
vi_non_na = vi_total - vi_na
pct_vi    = round(vi_cat / vi_non_na * 100) if vi_non_na > 0 else 0
print(f"  {'Total VI':<35} {vi_total:>6}")
print(f"  {'VI pointant vers N.A.':<35} {vi_na:>6}")
print(f"  {'VI avec categorie SKOS':<35} {vi_cat:>6}")
print(f"  {'Taux categorisation (hors N.A.)':<35} {pct_vi:>5}%")

# --- Catégorisation VD ---
print("\n  CATEGORISATION VD")
print("  " + "-" * 40)
vd_total  = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?v) AS ?n) WHERE {{ ?v a iadas:VariableDependante }}")
vd_na     = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?v) AS ?n) WHERE {{ ?v a iadas:VariableDependante ; iadas:refersToVariable ?c . FILTER(CONTAINS(STR(?c),'N.A')) }}")
vd_cat    = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?v) AS ?n) WHERE {{ ?v a iadas:VariableDependante ; iadas:refersToVariable ?c . ?c skos:broader ?b }}")
vd_non_na = vd_total - vd_na
pct_vd    = round(vd_cat / vd_non_na * 100) if vd_non_na > 0 else 0
print(f"  {'Total VD':<35} {vd_total:>6}")
print(f"  {'VD pointant vers N.A.':<35} {vd_na:>6}")
print(f"  {'VD avec categorie SKOS':<35} {vd_cat:>6}")
print(f"  {'Taux categorisation (hors N.A.)':<35} {pct_vd:>5}%")

# --- EffectSize ---
print("\n  EFFECTSIZE (analyses simples : r, rho, beta standardise)")
print("  " + "-" * 40)
d_es = query(f"""
{PREFIX}
SELECT ?cat (COUNT(*) AS ?n)
WHERE {{
  ?analysis a iadas:Analysis ; iadas:complexityOfAnalysis ?c ; iadas:hasRelation ?rel .
  FILTER({FILTER_SIMPLES})
  ?rel iadas:effectSize ?cat .
}}
GROUP BY ?cat ORDER BY DESC(?n)
""")
es_total = 0
for b in d_es["results"]["bindings"]:
    es_total += int(b["n"]["value"])
for b in d_es["results"]["bindings"]:
    n = int(b["n"]["value"])
    pct = round(n / es_total * 100) if es_total > 0 else 0
    print(f"  {b['cat']['value']:<35} {n:>6}  ({pct}%)")
print(f"  {'Total effectSize peuple':<35} {es_total:>6}")
couverture = round(es_total / analyses_simples * 100) if analyses_simples > 0 else 0
print(f"  {'Couverture (sur simples)':<35} {couverture:>5}%")

# --- VI par catégorie (analyses simples uniquement) ---
print("\n  VI PAR CATEGORIE (analyses simples)")
print("  " + "-" * 40)
d_vi = query(f"""
{PREFIX}
SELECT ?catLabel (COUNT(DISTINCT ?v) AS ?n)
WHERE {{
  ?analysis a iadas:Analysis ; iadas:complexityOfAnalysis ?c ; iadas:hasRelation ?rel .
  FILTER({FILTER_SIMPLES})
  ?rel iadas:hasIndependentVariable ?v .
  ?v iadas:refersToVariable ?concept .
  ?concept skos:broader+ ?top .
  ?top skos:prefLabel ?catLabel .
  FILTER NOT EXISTS {{ ?top skos:broader ?x . FILTER(CONTAINS(STR(?x), 'ACAD-vocab')) }}
}}
GROUP BY ?catLabel ORDER BY DESC(?n)
""")
for b in d_vi["results"]["bindings"]:
    print(f"  {b['catLabel']['value']:<35} {b['n']['value']:>6}")

# --- VD par catégorie (analyses simples uniquement) ---
print("\n  VD PAR CATEGORIE (analyses simples)")
print("  " + "-" * 40)
d_vd = query(f"""
{PREFIX}
SELECT ?catLabel (COUNT(DISTINCT ?v) AS ?n)
WHERE {{
  ?analysis a iadas:Analysis ; iadas:complexityOfAnalysis ?c ; iadas:hasRelation ?rel .
  FILTER({FILTER_SIMPLES})
  ?rel iadas:hasDependentVariable ?v .
  ?v iadas:refersToVariable ?concept .
  ?concept skos:broader+ ?top .
  ?top skos:prefLabel ?catLabel .
  FILTER NOT EXISTS {{ ?top skos:broader ?x . FILTER(CONTAINS(STR(?x), 'ACAD-vocab')) }}
}}
GROUP BY ?catLabel ORDER BY DESC(?n)
""")
for b in d_vd["results"]["bindings"]:
    print(f"  {b['catLabel']['value']:<35} {b['n']['value']:>6}")

# --- Direction des relations par categorie de VI (analyses simples) ---
print("\n  DIRECTION PAR CATEGORIE VI (analyses simples)")
print("  " + "-" * 40)
d_dir_vi = query(f"""
{PREFIX}
SELECT ?catLabel ?direction (COUNT(*) AS ?n)
WHERE {{
  ?analysis a iadas:Analysis ; iadas:complexityOfAnalysis ?c ;
            iadas:relationDirection ?direction ; iadas:hasRelation ?rel .
  FILTER({FILTER_SIMPLES})
  ?rel iadas:hasIndependentVariable ?v .
  ?v iadas:refersToVariable ?concept .
  ?concept skos:broader+ ?top .
  ?top skos:prefLabel ?catLabel .
  FILTER NOT EXISTS {{ ?top skos:broader ?x . FILTER(CONTAINS(STR(?x), 'ACAD-vocab')) }}
}}
GROUP BY ?catLabel ?direction
ORDER BY ?catLabel ?direction
""")
# Pivoter les resultats par categorie
from collections import defaultdict
dir_by_cat = defaultdict(dict)
for b in d_dir_vi["results"]["bindings"]:
    cat = b["catLabel"]["value"]
    d_ = b["direction"]["value"]
    dir_by_cat[cat][d_] = int(b["n"]["value"])
for cat, dirs in sorted(dir_by_cat.items(), key=lambda x: -sum(x[1].values())):
    total = sum(dirs.values())
    pos = dirs.get("+", 0)
    neg = dirs.get("-", 0)
    ns  = dirs.get("NS", 0) + dirs.get("N.A.", 0) + dirs.get("NA", 0)
    print(f"  {cat:<35} total={total:>5}  +={pos:>4}  -={neg:>4}  NS={ns:>4}")

# --- Direction par sport (top 10, analyses simples) ---
print("\n  DIRECTION PAR SPORT (top 10, analyses simples)")
print("  " + "-" * 40)
d_dir_sport = query(f"""
{PREFIX}
SELECT ?sportNom ?direction (COUNT(*) AS ?n)
WHERE {{
  ?analysis a iadas:Analysis ; iadas:complexityOfAnalysis ?c ;
            iadas:relationDirection ?direction ; iadas:hasSport ?sport .
  FILTER({FILTER_SIMPLES})
  BIND(REPLACE(STR(?sport), '.*/([^/]+)$', '$1') AS ?sportNom)
}}
GROUP BY ?sportNom ?direction
ORDER BY ?sportNom ?direction
""")
dir_by_sport = defaultdict(dict)
for b in d_dir_sport["results"]["bindings"]:
    sp = b["sportNom"]["value"].replace("_", " ")
    d_ = b["direction"]["value"]
    dir_by_sport[sp][d_] = int(b["n"]["value"])
top_sports = sorted(
    [(sp, dirs) for sp, dirs in dir_by_sport.items() if sp.strip() not in ("N.A.", "NA", "")],
    key=lambda x: -sum(x[1].values())
)[:10]
for sp, dirs in top_sports:
    total = sum(dirs.values())
    pos = dirs.get("+", 0)
    neg = dirs.get("-", 0)
    ns  = dirs.get("NS", 0) + dirs.get("N.A.", 0) + dirs.get("NA", 0)
    label = sp[:35]
    print(f"  {label:<35} total={total:>5}  +={pos:>4}  -={neg:>4}  NS={ns:>4}")

# --- Qualite SKOS ---
print("\n  QUALITE SKOS (vocabulaire ACAD)")
print("  " + "-" * 40)
total_concepts = count(f"{PREFIX} SELECT (COUNT(*) AS ?n) WHERE {{ ?c a skos:Concept . FILTER(CONTAINS(STR(?c), 'ACAD-vocab')) }}")
sans_label_skos = count(f"{PREFIX} SELECT (COUNT(*) AS ?n) WHERE {{ ?c a skos:Concept . FILTER(CONTAINS(STR(?c), 'ACAD-vocab')) FILTER NOT EXISTS {{ ?c skos:prefLabel ?l }} }}")
sans_scheme = count(f"{PREFIX} SELECT (COUNT(*) AS ?n) WHERE {{ ?c a skos:Concept . FILTER(CONTAINS(STR(?c), 'ACAD-vocab')) FILTER NOT EXISTS {{ ?c skos:inScheme ?s }} }}")
d_cycles = query(f"{PREFIX} SELECT (COUNT(*) AS ?n) WHERE {{ SELECT ?a WHERE {{ ?a skos:broader ?b . ?b skos:broader ?a . FILTER(CONTAINS(STR(?a), 'ACAD-vocab')) }} }}")
nb_cycles = int(d_cycles["results"]["bindings"][0]["n"]["value"])
d_roots = query(f"{PREFIX} SELECT (COUNT(*) AS ?n) WHERE {{ ?c a skos:Concept . FILTER(CONTAINS(STR(?c), 'ACAD-vocab')) FILTER NOT EXISTS {{ ?c skos:broader ?x }} }}")
nb_roots = int(d_roots["results"]["bindings"][0]["n"]["value"])
print(f"  {'Total concepts ACAD':<35} {total_concepts:>6}")
print(f"  {'Concepts racines (topConceptOf)':<35} {nb_roots:>6}  [DEAB, Intra, Inter, Other, Socio]")
print(f"  {'Sans prefLabel':<35} {sans_label_skos:>6}  {'[OK]' if sans_label_skos == 0 else '[!]'}")
print(f"  {'Sans inScheme':<35} {sans_scheme:>6}  {'[OK]' if sans_scheme == 0 else '[!]'}")
print(f"  {'Cycles skos:broader':<35} {nb_cycles:>6}  {'[OK]' if nb_cycles == 0 else '[!]'}")

# --- Qualite des donnees : detection doublons ---
print("\n  QUALITE DES DONNEES")
print("  " + "-" * 40)

# Groupes meme article+VI+VD (repetitions legitimees = sous-groupes)
d_rep = query(f"""
{PREFIX}
SELECT ?titre ?viNom ?vdNom (COUNT(DISTINCT ?an) AS ?nb)
WHERE {{
  ?art a iadas:SportPsychologyArticle ; dct:title ?titre ; iadas:hasAnalysis ?an .
  ?an iadas:hasRelation ?rel .
  ?rel iadas:hasIndependentVariable ?vi ; iadas:hasDependentVariable ?vd .
  ?vi iadas:variableName ?viNom . ?vd iadas:variableName ?vdNom .
}}
GROUP BY ?titre ?viNom ?vdNom
HAVING (COUNT(DISTINCT ?an) > 1)
""")
nb_groupes_rep = len(d_rep["results"]["bindings"])

# Vrais doublons : meme article+VI+VD+direction+valeur+effectif
d_vrais = query(f"""
{PREFIX}
SELECT ?titre ?viNom ?vdNom ?direction ?degree ?sampleSize (COUNT(DISTINCT ?an) AS ?nb)
WHERE {{
  ?art a iadas:SportPsychologyArticle ; dct:title ?titre ; iadas:hasAnalysis ?an .
  ?an iadas:hasRelation ?rel ; iadas:hasPopulation ?pop .
  ?rel iadas:hasIndependentVariable ?vi ; iadas:hasDependentVariable ?vd ;
       iadas:relationDirection ?direction ; iadas:relationDegreeSecondary ?degree .
  ?vi iadas:variableName ?viNom . ?vd iadas:variableName ?vdNom .
  ?pop iadas:sampleSize ?sampleSize .
}}
GROUP BY ?titre ?viNom ?vdNom ?direction ?degree ?sampleSize
HAVING (COUNT(DISTINCT ?an) > 1)
""")
nb_vrais_doublons = len(d_vrais["results"]["bindings"])

print(f"  {'Groupes article+VI+VD (sous-groupes OK)':<35} {nb_groupes_rep:>6}")
print(f"  {'Vrais doublons (+ direction+valeur+n=)':<35} {nb_vrais_doublons:>6}  [OK]")

# --- Analyses complexes : vue d'ensemble ---
print("\n  ANALYSES COMPLEXES — VUE D'ENSEMBLE")
print("  " + "-" * 40)
cx_total  = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?a) AS ?n) WHERE {{ ?a a iadas:Analysis ; iadas:complexityOfAnalysis ?c . FILTER({FILTER_COMPLEXES}) }}")
cx_med    = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?a) AS ?n) WHERE {{ ?a a iadas:Analysis ; iadas:complexityOfAnalysis ?c ; iadas:hasMediator ?m . FILTER({FILTER_COMPLEXES}) FILTER(?m != 'N.A.') }}")
cx_mod    = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?a) AS ?n) WHERE {{ ?a a iadas:Analysis ; iadas:complexityOfAnalysis ?c ; iadas:hasModerator ?m . FILTER({FILTER_COMPLEXES}) FILTER(?m != 'N.A.') }}")
cx_medmod = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?a) AS ?n) WHERE {{ ?a a iadas:Analysis ; iadas:complexityOfAnalysis ?c ; iadas:hasMediator ?med ; iadas:hasModerator ?mod . FILTER({FILTER_COMPLEXES}) FILTER(?med != 'N.A.') FILTER(?mod != 'N.A.') }}")
print(f"  {'Total analyses complexes':<35} {cx_total:>6}")
print(f"  {'Avec mediateur renseigne':<35} {cx_med:>6}")
print(f"  {'Avec moderateur renseigne':<35} {cx_mod:>6}")
print(f"  {'Avec mediateur ET moderateur':<35} {cx_medmod:>6}")

# --- Repartition par type d'analyse ---
print("\n  TYPES D'ANALYSES COMPLEXES (top 10)")
print("  " + "-" * 40)
d_types = query(f"""
{PREFIX}
SELECT ?type (COUNT(*) AS ?n)
WHERE {{
  ?a a iadas:Analysis ; iadas:complexityOfAnalysis ?c ; iadas:typeOfAnalysis ?type .
  FILTER({FILTER_COMPLEXES})
}}
GROUP BY ?type ORDER BY DESC(?n)
""")
for b in d_types["results"]["bindings"][:10]:
    print(f"  {b['type']['value'][:35]:<35} {b['n']['value']:>6}")

# --- Top mediateurs ---
print("\n  TOP MEDIATEURS (analyses complexes)")
print("  " + "-" * 40)
d_meds = query(f"""
{PREFIX}
SELECT ?mediateur (COUNT(DISTINCT ?a) AS ?n)
WHERE {{
  ?a a iadas:Analysis ; iadas:complexityOfAnalysis ?c ; iadas:hasMediator ?mediateur .
  FILTER({FILTER_COMPLEXES})
  FILTER(?mediateur != "N.A.")
}}
GROUP BY ?mediateur ORDER BY DESC(?n)
""")
for b in d_meds["results"]["bindings"][:10]:
    label = b["mediateur"]["value"][:35]
    print(f"  {label:<35} {b['n']['value']:>6}")

# --- Top moderateurs ---
print("\n  TOP MODERATEURS (analyses complexes)")
print("  " + "-" * 40)
d_mods = query(f"""
{PREFIX}
SELECT ?moderateur (COUNT(DISTINCT ?a) AS ?n)
WHERE {{
  ?a a iadas:Analysis ; iadas:complexityOfAnalysis ?c ; iadas:hasModerator ?moderateur .
  FILTER({FILTER_COMPLEXES})
  FILTER(?moderateur != "N.A.")
}}
GROUP BY ?moderateur ORDER BY DESC(?n)
""")
for b in d_mods["results"]["bindings"][:10]:
    label = b["moderateur"]["value"][:35]
    print(f"  {label:<35} {b['n']['value']:>6}")

# --- Categorisation VI/VD dans les complexes ---
print("\n  CATEGORISATION VI/VD (analyses complexes)")
print("  " + "-" * 40)
cx_vi_total = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?v) AS ?n) WHERE {{ ?a a iadas:Analysis ; iadas:complexityOfAnalysis ?c ; iadas:hasRelation ?rel . FILTER({FILTER_COMPLEXES}) ?rel iadas:hasIndependentVariable ?v }}")
cx_vi_cat   = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?v) AS ?n) WHERE {{ ?a a iadas:Analysis ; iadas:complexityOfAnalysis ?c ; iadas:hasRelation ?rel . FILTER({FILTER_COMPLEXES}) ?rel iadas:hasIndependentVariable ?v . ?v iadas:refersToVariable ?concept . ?concept skos:broader ?b }}")
cx_vd_total = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?v) AS ?n) WHERE {{ ?a a iadas:Analysis ; iadas:complexityOfAnalysis ?c ; iadas:hasRelation ?rel . FILTER({FILTER_COMPLEXES}) ?rel iadas:hasDependentVariable ?v }}")
cx_vd_cat   = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?v) AS ?n) WHERE {{ ?a a iadas:Analysis ; iadas:complexityOfAnalysis ?c ; iadas:hasRelation ?rel . FILTER({FILTER_COMPLEXES}) ?rel iadas:hasDependentVariable ?v . ?v iadas:refersToVariable ?concept . ?concept skos:broader ?b }}")
pct_cx_vi = round(cx_vi_cat / cx_vi_total * 100) if cx_vi_total > 0 else 0
pct_cx_vd = round(cx_vd_cat / cx_vd_total * 100) if cx_vd_total > 0 else 0
print(f"  {'VI total (complexes)':<35} {cx_vi_total:>6}")
print(f"  {'VI avec categorie SKOS':<35} {cx_vi_cat:>6}  ({pct_cx_vi}%)")
print(f"  {'VD total (complexes)':<35} {cx_vd_total:>6}")
print(f"  {'VD avec categorie SKOS':<35} {cx_vd_cat:>6}  ({pct_cx_vd}%)")

print("\n" + "=" * 55)
