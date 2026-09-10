"""
sport_excel_to_ttl.py — Corrige (diff + patch) sport-hierarchy-simple-clean.ttl
depuis data/Sport hierarchy_VF_09avr26.xlsx (feuilles "Classification sport" + "Hierarchy").

Ne reconstruit PAS le fichier : construit un graphe cible depuis l'Excel avec le
même schéma d'URI/prédicats que l'existant, puis ne corrige QUE les sujets
sport-vocab:/sport-category-vocab: qui diffèrent (ajout de concepts nouveaux,
correction des propriétés qui ont changé). Les sujets présents dans le TTL actuel
mais absents du nouvel Excel ne sont JAMAIS supprimés — seulement reportés.

Lancer depuis la racine du repo :
    python -m ia_cad.tools.ontology.sport_excel_to_ttl [--dry-run]
"""
import argparse
import sys
from datetime import date
from pathlib import Path
from urllib.parse import quote

import pandas as pd
from rdflib import Graph, Literal, URIRef
from rdflib.namespace import DCTERMS, RDF
from rdflib.plugins.serializers.nt import _nt_row

from ia_cad.paths import DATA_DIR, ONTOLOGY_DIR, REPO_ROOT, RESULTS_DIR

EXCEL_PATH = DATA_DIR / "Sport hierarchy_VF_09avr26.xlsx"
TTL_PATH = ONTOLOGY_DIR / "Onto" / "sport-hierarchy-simple-clean.ttl"
REPORT_DIR = RESULTS_DIR / "comparisons"

CAT = "http://ns.inria.fr/iadas/sport-category-vocab/"
SPORT = "http://ns.inria.fr/iadas/sport-vocab/"
I = "http://ns.inria.fr/iadas/ontology/"
SKOS = "http://www.w3.org/2004/02/skos/core#"

_NA = {"", "N.A.", "NA", "N/A", "None", "null", "nan"}


def na(val):
    """None pour toute valeur manquante/N.A., sinon la chaîne nettoyée."""
    if val is None:
        return None
    if isinstance(val, float):
        import math
        if math.isnan(val):
            return None
    s = str(val).strip()
    return None if s in _NA else s


def slug(text: str) -> str:
    """Même codec que celui déjà utilisé dans le TTL existant : espaces → '_',
    puis percent-encoding intégral, y compris '/' (safe="") — vérifié contre un
    nom de sport existant contenant '/' : 'Track_and_field%2FAthletics' dans le
    fichier actuel. abox_to_gt._localname_text fait l'inverse (unquote + '_' → ' ')."""
    return quote(str(text).strip().replace(" ", "_"), safe="")


def uri_cat(name: str) -> URIRef:
    return URIRef(CAT + slug(name))


def uri_sport(name: str) -> URIRef:
    return URIRef(SPORT + slug(name))


# ─── Construction du graphe cible depuis l'Excel ──────────────────────────────

def build_target_graph(xlsx_path: Path) -> Graph:
    g = Graph()

    cs = pd.read_excel(xlsx_path, sheet_name="Classification sport")
    cs.columns = cs.columns.str.strip()
    for _, row in cs.iterrows():
        concept = na(row.get("Concept"))
        if not concept:
            continue
        s = uri_cat(concept)
        g.add((s, URIRef(SKOS + "prefLabel"), Literal(concept)))
        desc = na(row.get("Definition"))
        if desc:
            g.add((s, URIRef(SKOS + "description"), Literal(desc)))

    # Colonnes de la feuille "Hierarchy" : Class 1 / Sub class 2 / Sub class 3 /
    # Synonym / Definition / Références (accentué -> mal décodé selon l'encodage
    # source ; on référence donc cette 6e colonne par position, pas par nom).
    h = pd.read_excel(xlsx_path, sheet_name="Hierarchy")
    h = h.iloc[:, :6]
    h.columns = ["Class1", "Sub2", "Sub3", "Synonym", "Definition", "References"]

    for _, row in h.iterrows():
        class1 = na(row.get("Class1"))
        sub2 = na(row.get("Sub2"))
        sub3 = na(row.get("Sub3"))
        if not sub2:
            continue  # ligne de définition de catégorie, redondante, ignorée

        name = sub3 or sub2
        s = uri_sport(name)
        g.add((s, RDF.type, URIRef(I + "Sport")))
        g.add((s, RDF.type, URIRef(SKOS + "Concept")))
        g.add((s, URIRef(SKOS + "inScheme"), URIRef(CAT + "Sport")))
        if class1:
            g.add((s, URIRef(I + "sportCategory"), uri_cat(class1)))
        g.add((s, URIRef(SKOS + "prefLabel"), Literal(name)))

        syn = na(row.get("Synonym"))
        if syn:
            g.add((s, URIRef(SKOS + "altLabel"), Literal(syn)))
        defi = na(row.get("Definition"))
        if defi:
            g.add((s, URIRef(SKOS + "description"), Literal(defi)))
        ref = na(row.get("References"))
        if ref:
            g.add((s, DCTERMS.source, Literal(ref)))

        if sub3:
            g.add((s, URIRef(SKOS + "broader"), uri_sport(sub2)))

    return g


# ─── Diff + patch ──────────────────────────────────────────────────────────────

def selectable_subjects(g: Graph) -> set:
    """Concepts sport-vocab:/sport-category-vocab: (skos:Concept), hors le
    ConceptScheme racine (sport-category-vocab:Sport) et toute autre métadonnée
    du scheme qu'on ne touche jamais faute de source dans l'Excel."""
    out = set()
    for s in g.subjects(RDF.type, URIRef(SKOS + "Concept")):
        if str(s).startswith(CAT) or str(s).startswith(SPORT):
            out.add(s)
    return out


def diff_and_patch(current: Graph, target: Graph):
    """Corrige `current` en place. Retourne (corrections, ajouts, orphelins)."""
    current_subjects = selectable_subjects(current)
    target_subjects = selectable_subjects(target)

    common = current_subjects & target_subjects
    only_target = target_subjects - current_subjects
    only_current = current_subjects - target_subjects

    corrections = []
    for s in sorted(common, key=str):
        cur_triples = set(current.triples((s, None, None)))
        tgt_triples = set(target.triples((s, None, None)))
        removed = cur_triples - tgt_triples
        added = tgt_triples - cur_triples
        if removed or added:
            for t in removed:
                current.remove(t)
            for t in added:
                current.add(t)
            corrections.append((s, removed, added))

    for s in only_target:
        for t in target.triples((s, None, None)):
            current.add(t)

    return corrections, sorted(only_target, key=str), sorted(only_current, key=str)


def write_sorted_nt(graph: Graph, path: Path):
    """Trie par (str(sujet), str(prédicat), str(objet)) — PAS par la ligne NT
    rendue : trier le texte '<...>' rendu casse la comparaison numérique des ID
    ('sport-vocab/1500m' vs '.../100_meters' : le '>' de fermeture s'intercale
    avant le chiffre suivant). Trier les termes bruts reproduit l'ordre du
    fichier existant. _nt_row garantit un encodage identique à
    graph.serialize(format='nt')."""
    triples = sorted(graph, key=lambda t: (str(t[0]), str(t[1]), str(t[2])))
    lines = [_nt_row(t).rstrip("\n") for t in triples]
    # newline="\n" : le fichier existant est en LF ; write_text traduirait sinon
    # vers os.linesep (CRLF sous Windows), gonflant artificiellement le diff.
    path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def _fmt_triple(t) -> str:
    _, p, o = t
    pred = str(p).rsplit("/", 1)[-1].rsplit("#", 1)[-1]
    return f"{pred} = {o}"


def main() -> int:
    ap = argparse.ArgumentParser(description="Corrige le thésaurus sport depuis Excel.")
    ap.add_argument("--dry-run", action="store_true", help="N'écrit rien, affiche le résumé.")
    args = ap.parse_args()

    print(f"Chargement {TTL_PATH.name} ...")
    current = Graph()
    current.parse(str(TTL_PATH), format="turtle")
    print(f"  {len(current)} triplets")

    print(f"Lecture {EXCEL_PATH.name} ...")
    target = build_target_graph(EXCEL_PATH)
    print(f"  {len(selectable_subjects(target))} concepts sport dans l'Excel")

    corrections, ajouts, orphelins = diff_and_patch(current, target)

    lines = [
        "=" * 70,
        f"sport_excel_to_ttl — correction depuis {EXCEL_PATH.name}",
        "=" * 70,
        f"Concepts corrigés : {len(corrections)}",
        f"Concepts ajoutés  : {len(ajouts)}",
        f"Concepts orphelins (absents du nouvel Excel, NON supprimés) : {len(orphelins)}",
        "",
    ]
    for s, removed, added in corrections:
        lines.append(f"  ~ {s}")
        for t in sorted(removed, key=str):
            lines.append(f"      - {_fmt_triple(t)}")
        for t in sorted(added, key=str):
            lines.append(f"      + {_fmt_triple(t)}")
    if ajouts:
        lines.append("")
        lines.append("Ajoutés :")
        lines += [f"  + {s}" for s in ajouts]
    if orphelins:
        lines.append("")
        lines.append("Orphelins (à relire manuellement) :")
        lines += [f"  ? {s}" for s in orphelins]

    print(f"Concepts corrigés : {len(corrections)}, ajoutés : {len(ajouts)}, "
          f"orphelins : {len(orphelins)}")
    print("\n--- échantillon corrections (5) ---")
    for s, removed, added in corrections[:5]:
        print(f"  ~ {s}")
        for t in sorted(removed, key=str):
            print(f"      - {_fmt_triple(t)}")
        for t in sorted(added, key=str):
            print(f"      + {_fmt_triple(t)}")
    print("\n--- ajoutés (10 premiers) ---")
    for s in ajouts[:10]:
        print(f"  + {s}")
    print("\n--- orphelins (tous) ---")
    for s in orphelins:
        print(f"  ? {s}")

    if args.dry_run:
        print("\n--dry-run : rien n'a été écrit.")
        return 0

    write_sorted_nt(current, TTL_PATH)
    print(f"\nÉcrit : {TTL_PATH.relative_to(REPO_ROOT)}")

    rp_dir = REPORT_DIR / f"{date.today():%Y-%m-%d}"
    rp_dir.mkdir(parents=True, exist_ok=True)
    rp = rp_dir / "sport_ttl_correction_report.txt"
    rp.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Rapport : {rp.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
