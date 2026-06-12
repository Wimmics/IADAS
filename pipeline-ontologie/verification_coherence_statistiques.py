#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Verification de coherence : statistiques generales (sexe, pays, tailles
d'echantillon, sports, types d'etude) entre l'ontologie (Fuseki) et le
CSV pivot du pipeline (data-csv-converted/IA-DAS-Data-unique-ids.csv,
miroir direct de l'Excel source).

Tache 6 (reunion Mme Molka 11/06/2026) : etendre la verification de
coherence ontologie <-> Excel a TOUTES les statistiques, pas seulement
le vocabulaire ACAD (cf. verification_coherence_ontologie_excel.py,
Tache 1).

Pour chaque chiffre, le commentaire indique la SOURCE EXACTE :
- "Excel" = lecture Python du CSV pivot (copie fidele de l'Excel source,
  une ligne = une analyse)
- "Fuseki" = requete SPARQL sur le dataset ds
"""

import csv
import json
import urllib.request
import urllib.parse
import base64
from pathlib import Path
from collections import Counter

FUSEKI = "http://localhost:3030/ds/sparql"
PREFIX = "PREFIX iadas: <http://ns.inria.fr/iadas/ontology/>\n"

BASE_DIR = Path(__file__).resolve().parent
CSV_PIVOT = BASE_DIR / "data-csv-converted" / "IA-DAS-Data-unique-ids.csv"


def sparql(query):
    data = ("query=" + urllib.parse.quote(PREFIX + query)).encode()
    req = urllib.request.Request(FUSEKI, data=data, method="POST")
    req.add_header("Accept", "application/sparql-results+json")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    auth = base64.b64encode(b"admin:admin").decode()
    req.add_header("Authorization", "Basic " + auth)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def count(query):
    return int(sparql(query)["results"]["bindings"][0]["n"]["value"])


def sparql_counter(query, var):
    """Execute une requete GROUP BY et renvoie un Counter {valeur: n}."""
    result = sparql(query)
    return Counter({
        b[var]["value"]: int(b["n"]["value"])
        for b in result["results"]["bindings"]
    })


def load_csv_rows():
    with open(CSV_PIVOT, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def compare_counters(name, excel_counter, fuseki_counter, top=10):
    print(f"\n{name}")
    print(f"  Distinct (Excel)  = {len(excel_counter)}")
    print(f"  Distinct (Fuseki) = {len(fuseki_counter)}")

    only_excel = set(excel_counter) - set(fuseki_counter)
    only_fuseki = set(fuseki_counter) - set(excel_counter)
    mismatched_counts = {
        k: (excel_counter[k], fuseki_counter[k])
        for k in (set(excel_counter) & set(fuseki_counter))
        if excel_counter[k] != fuseki_counter[k]
    }

    if not only_excel and not only_fuseki and not mismatched_counts:
        print("  OK - valeurs et comptages identiques des deux cotes")
    else:
        if only_excel:
            print(f"  Valeurs presentes dans Excel mais absentes de Fuseki ({len(only_excel)}): "
                  f"{sorted(only_excel)[:top]}")
        if only_fuseki:
            print(f"  Valeurs presentes dans Fuseki mais absentes d'Excel ({len(only_fuseki)}): "
                  f"{sorted(only_fuseki)[:top]}")
        if mismatched_counts:
            print(f"  Comptages differents ({len(mismatched_counts)}) :")
            for k, (e, fu) in list(mismatched_counts.items())[:top]:
                print(f"    {k!r}: Excel={e} / Fuseki={fu}")

    print("  Top valeurs (Excel):")
    for val, n in excel_counter.most_common(5):
        print(f"    {val}: {n}")


def main():
    rows = load_csv_rows()
    print("=" * 70)
    print("  VERIFICATION COHERENCE ONTOLOGIE <-> EXCEL  (statistiques generales)")
    print("=" * 70)
    print(f"\nSource Excel : {CSV_PIVOT.relative_to(BASE_DIR)}")
    print(f"Lignes (= analyses) = {len(rows)}")

    # -------------------------------------------------------------------
    # 1. Nombre total d'analyses
    # -------------------------------------------------------------------
    total_excel = len(rows)
    total_fuseki = count("SELECT (COUNT(*) AS ?n) WHERE { ?s a iadas:Analysis }")
    print(f"\n[1] Nombre total d'analyses")
    print(f"    Excel  (lignes du CSV pivot)                = {total_excel}")
    print(f"    Fuseki (?s a iadas:Analysis)                = {total_fuseki}")
    print(f"    {'OK' if total_excel == total_fuseki else '!! ECART !!'}")

    # -------------------------------------------------------------------
    # 2. Repartition par sexe (Sex -> iadas:gender)
    # -------------------------------------------------------------------
    excel_gender = Counter(r["Sex"].strip() for r in rows if r["Sex"].strip())
    fuseki_gender = sparql_counter(
        "SELECT ?g (COUNT(*) AS ?n) WHERE { ?p iadas:gender ?g } GROUP BY ?g", "g")
    compare_counters("[2] Repartition par sexe (Sex / iadas:gender)", excel_gender, fuseki_gender)

    # -------------------------------------------------------------------
    # 3. Tailles d'echantillon (N -> iadas:sampleSize)
    # -------------------------------------------------------------------
    excel_n = []
    for r in rows:
        try:
            excel_n.append(int(r["N"]))
        except (ValueError, KeyError):
            pass

    # Les valeurs sont stockees comme litteraux non typis (xsd:string) -> on
    # recupere les valeurs brutes et on calcule min/max/moyenne en Python.
    raw = sparql("SELECT ?v WHERE { ?p iadas:sampleSize ?v }")
    fuseki_n = []
    for b in raw["results"]["bindings"]:
        try:
            fuseki_n.append(int(b["v"]["value"]))
        except ValueError:
            pass
    fuseki_n_count = len(fuseki_n)
    fuseki_min, fuseki_max, fuseki_avg = min(fuseki_n), max(fuseki_n), sum(fuseki_n) / len(fuseki_n)

    print(f"\n[3] Tailles d'echantillon (N / iadas:sampleSize)")
    print(f"    Nombre de valeurs : Excel={len(excel_n)} / Fuseki={fuseki_n_count}")
    print(f"    Min  : Excel={min(excel_n)} / Fuseki={fuseki_min:.0f}")
    print(f"    Max  : Excel={max(excel_n)} / Fuseki={fuseki_max:.0f}")
    print(f"    Moyenne : Excel={sum(excel_n)/len(excel_n):.2f} / Fuseki={fuseki_avg:.2f}")
    ok = (len(excel_n) == fuseki_n_count
          and min(excel_n) == fuseki_min
          and max(excel_n) == fuseki_max)
    print(f"    {'OK' if ok else '!! ECART !!'}")

    # -------------------------------------------------------------------
    # 4. Pays (Country -> iadas:country)
    # -------------------------------------------------------------------
    excel_country = Counter(r["Country"].strip() for r in rows if r["Country"].strip())
    fuseki_country = sparql_counter(
        "SELECT ?c (COUNT(*) AS ?n) WHERE { ?a iadas:country ?c } GROUP BY ?c", "c")
    compare_counters("[4] Pays (Country / iadas:country)", excel_country, fuseki_country)

    # -------------------------------------------------------------------
    # 5. Types d'etude (Types of study -> iadas:studyType)
    # -------------------------------------------------------------------
    excel_study = Counter(r["Types of study"].strip() for r in rows if r["Types of study"].strip())
    fuseki_study = sparql_counter(
        "SELECT ?t (COUNT(*) AS ?n) WHERE { ?a iadas:studyType ?t } GROUP BY ?t", "t")
    compare_counters("[5] Types d'etude (Types of study / iadas:studyType)", excel_study, fuseki_study)

    # -------------------------------------------------------------------
    # 6. Sports (Sport_name -> iadas:hasSport, URI sport-vocab/{Sport_name})
    # -------------------------------------------------------------------
    excel_sport = Counter(r["Sport_name"].strip() for r in rows if r["Sport_name"].strip())

    fuseki_sport_raw = sparql_counter(
        "SELECT ?s (COUNT(*) AS ?n) WHERE { ?a iadas:hasSport ?s } GROUP BY ?s", "s")
    # Decoder l'URI sport-vocab/{Sport_name} -> nom de sport (meme transformation
    # que rr:template, en sens inverse : %xx decode + underscores -> espaces).
    fuseki_sport = Counter()
    for uri, n in fuseki_sport_raw.items():
        name = uri.rsplit("/", 1)[-1]
        name = urllib.parse.unquote(name).replace("_", " ")
        fuseki_sport[name] += n

    compare_counters("[6] Sports (Sport_name / iadas:hasSport)", excel_sport, fuseki_sport)

    print("\n" + "=" * 70)
    print("  FIN DE LA VERIFICATION")
    print("=" * 70)


if __name__ == "__main__":
    main()
