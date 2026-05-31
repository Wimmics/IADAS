"""
Script de statistiques BDD IADAS
Usage : python stats_bdd.py
"""

import urllib.request
import urllib.parse
import json
from datetime import datetime

FUSEKI = "http://localhost:3030/ds/sparql"
AUTH = ("admin", "admin")

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
"""

print("=" * 55)
print(f"  STATS BDD IADAS — {datetime.now().strftime('%d/%m/%Y %H:%M')}")
print("=" * 55)

# --- Instances par classe ---
classes = [
    ("SportPsychologyArticle", "Articles"),
    ("Analysis",               "Analyses"),
    ("Population",             "Populations"),
    ("VariableIndependante",   "Variables indépendantes (VI)"),
    ("VariableDependante",     "Variables dépendantes (VD)"),
    ("Relations",              "Relations"),
]

print("\n  INSTANCES PAR CLASSE")
print("  " + "-" * 40)
for cls, label in classes:
    n = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE {{ ?x a iadas:{cls} }}")
    print(f"  {label:<35} {n:>6}")

# --- Triples total ---
total = count(f"SELECT (COUNT(*) AS ?n) WHERE {{ ?s ?p ?o }}")
print(f"\n  {'Triples total':<35} {total:>6}")

# --- Catégorisation VI ---
print("\n  CATEGORISATION VI")
print("  " + "-" * 40)
vi_total = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?v) AS ?n) WHERE {{ ?v a iadas:VariableIndependante }}")
vi_na    = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?v) AS ?n) WHERE {{ ?v a iadas:VariableIndependante ; iadas:refersToVariable ?c . FILTER(CONTAINS(STR(?c),'N.A')) }}")
vi_cat   = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?v) AS ?n) WHERE {{ ?v a iadas:VariableIndependante ; iadas:refersToVariable ?c . ?c skos:broader ?b }}")
vi_non_na = vi_total - vi_na
pct_vi = round(vi_cat / vi_non_na * 100) if vi_non_na > 0 else 0

print(f"  {'Total VI':<35} {vi_total:>6}")
print(f"  {'VI pointant vers N.A.':<35} {vi_na:>6}")
print(f"  {'VI avec categorie SKOS':<35} {vi_cat:>6}")
print(f"  {'Taux categorisation (hors N.A.)':<35} {pct_vi:>5}%")

# --- Catégorisation VD ---
print("\n  CATEGORISATION VD")
print("  " + "-" * 40)
vd_total = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?v) AS ?n) WHERE {{ ?v a iadas:VariableDependante }}")
vd_na    = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?v) AS ?n) WHERE {{ ?v a iadas:VariableDependante ; iadas:refersToVariable ?c . FILTER(CONTAINS(STR(?c),'N.A')) }}")
vd_cat   = count(f"{PREFIX} SELECT (COUNT(DISTINCT ?v) AS ?n) WHERE {{ ?v a iadas:VariableDependante ; iadas:refersToVariable ?c . ?c skos:broader ?b }}")
vd_non_na = vd_total - vd_na
pct_vd = round(vd_cat / vd_non_na * 100) if vd_non_na > 0 else 0

print(f"  {'Total VD':<35} {vd_total:>6}")
print(f"  {'VD pointant vers N.A.':<35} {vd_na:>6}")
print(f"  {'VD avec categorie SKOS':<35} {vd_cat:>6}")
print(f"  {'Taux categorisation (hors N.A.)':<35} {pct_vd:>5}%")

# --- Répartition VI par catégorie top ---
print("\n  VI PAR CATEGORIE TOP")
print("  " + "-" * 40)
d = query(f"""
{PREFIX}
SELECT ?catLabel (COUNT(DISTINCT ?v) AS ?n)
WHERE {{
  ?v a iadas:VariableIndependante ; iadas:refersToVariable ?concept .
  ?concept skos:broader+ ?top .
  ?top skos:prefLabel ?catLabel .
  FILTER NOT EXISTS {{ ?top skos:broader ?x . FILTER(CONTAINS(STR(?x), 'ACAD-vocab')) }}
}}
GROUP BY ?catLabel ORDER BY DESC(?n)
""")
for b in d["results"]["bindings"]:
    print(f"  {b['catLabel']['value']:<35} {b['n']['value']:>6}")

# --- Répartition VD par catégorie top ---
print("\n  VD PAR CATEGORIE TOP")
print("  " + "-" * 40)
d = query(f"""
{PREFIX}
SELECT ?catLabel (COUNT(DISTINCT ?v) AS ?n)
WHERE {{
  ?v a iadas:VariableDependante ; iadas:refersToVariable ?concept .
  ?concept skos:broader+ ?top .
  ?top skos:prefLabel ?catLabel .
  FILTER NOT EXISTS {{ ?top skos:broader ?x . FILTER(CONTAINS(STR(?x), 'ACAD-vocab')) }}
}}
GROUP BY ?catLabel ORDER BY DESC(?n)
""")
for b in d["results"]["bindings"]:
    print(f"  {b['catLabel']['value']:<35} {b['n']['value']:>6}")

print("\n" + "=" * 55)
