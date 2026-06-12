#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tache 3 (suite) : pour chacun des 29 groupes de quasi-doublons detectes par
find_quasi_doublons_corrections.py, interroge Fuseki pour chaque forme
(URI ACAD-vocab/{forme}) afin de determiner si c'est :
  - un VRAI doublon (une des 2 formes est un orphelin, 0 usage VI/VD,
    meme position dans la hierarchie) -> a corriger (Option A+C)
  - un FAUX doublon (les 2 formes existent, sont utilisees, relation
    parent/enfant ou roles differents) -> NE RIEN FAIRE

Pour chaque forme on affiche : URI, existe (skos:Concept) ?, skos:broader,
skos:narrower, nb usages VI, nb usages VD.
"""

import csv
import json
import re
import urllib.request
import urllib.parse
import base64
from collections import defaultdict
from pathlib import Path

FUSEKI = "http://localhost:3030/ds/sparql"
PREFIX = """
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>
"""

BASE_DIR = Path(__file__).resolve().parent
INPUT_CSV = BASE_DIR / "data-csv" / "Class-Hierarchy-V1.csv"
ENRICHMENT_TTL = BASE_DIR / "skos-acad-enrichment.ttl"
LABEL_COLS = ["CLASS", "sub-class 1", "sub-class 2", "sub-class 3", "sub-class 4"]


def sparql(query):
    data = ("query=" + urllib.parse.quote(PREFIX + query)).encode()
    req = urllib.request.Request(FUSEKI, data=data, method="POST")
    req.add_header("Accept", "application/sparql-results+json")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    auth = base64.b64encode(b"admin:admin").decode()
    req.add_header("Authorization", "Basic " + auth)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def label_to_uri(label):
    encoded = urllib.parse.quote(label, safe="")
    encoded = encoded.replace("%20", "_")
    return f"http://ns.inria.fr/iadas/ACAD-vocab/{encoded}"


def inspect_uri(uri):
    q = f"""
    SELECT
      (EXISTS {{ <{uri}> a skos:Concept }} AS ?exists)
      ?broader ?narrower
      (COUNT(DISTINCT ?vi) AS ?nvi)
      (COUNT(DISTINCT ?vd) AS ?nvd)
    WHERE {{
      OPTIONAL {{ <{uri}> skos:broader ?broader }}
      OPTIONAL {{ <{uri}> skos:narrower ?narrower }}
      OPTIONAL {{ ?vi iadas:refersToVariable <{uri}> ; a iadas:VariableIndependante }}
      OPTIONAL {{ ?vd iadas:refersToVariable <{uri}> ; a iadas:VariableDependante }}
    }}
    GROUP BY ?broader ?narrower
    """
    r = sparql(q)
    bindings = r["results"]["bindings"]
    if not bindings:
        return {"exists": False, "broader": None, "narrower": None, "nvi": 0, "nvd": 0}
    b = bindings[0]
    return {
        "exists": b["exists"]["value"] == "true",
        "broader": b["broader"]["value"].rsplit("/", 1)[-1] if "broader" in b else None,
        "narrower": b["narrower"]["value"].rsplit("/", 1)[-1] if "narrower" in b else None,
        "nvi": int(b["nvi"]["value"]),
        "nvd": int(b["nvd"]["value"]),
    }


def main():
    variants = defaultdict(lambda: defaultdict(lambda: [0, set()]))

    with open(INPUT_CSV, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        rows = list(reader)
    header = rows[0]
    col_idx = {name: header.index(name) for name in LABEL_COLS if name in header}

    for row in rows[1:]:
        for col in col_idx.values():
            if col >= len(row):
                continue
            val = row[col]
            if val.strip() == "":
                continue
            key = val.strip().lower()
            variants[key][val][0] += 1
            variants[key][val][1].add("CSV")

    with open(ENRICHMENT_TTL, encoding="utf-8") as f:
        content = f.read()
    for label in re.findall(r'skos:prefLabel "([^"]+)"', content):
        key = label.strip().lower()
        variants[key][label][0] += 1
        variants[key][label][1].add("enrichment.ttl")

    groups = {k: v for k, v in variants.items() if len(v) > 1}

    print(f"Groupes a trier: {len(groups)}\n")
    print("=" * 80)

    for key, forms in sorted(groups.items()):
        print(f"\nGROUPE: {key!r}")
        for form, (n, sources) in sorted(forms.items(), key=lambda kv: -kv[1][0]):
            uri = label_to_uri(form)
            info = inspect_uri(uri)
            print(f"  forme={form!r:55} ({n}x, {','.join(sorted(sources))})")
            print(f"    URI       = {uri}")
            print(f"    existe    = {info['exists']}")
            print(f"    broader   = {info['broader']}")
            print(f"    narrower  = {info['narrower']}")
            print(f"    usages VI = {info['nvi']}  / VD = {info['nvd']}")


if __name__ == "__main__":
    main()
