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

FILTER_SIMPLES = '?c = "Simple analyses" || ?c = "simple analyses"'

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

print("\n" + "=" * 55)
