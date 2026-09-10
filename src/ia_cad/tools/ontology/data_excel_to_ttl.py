"""
data_excel_to_ttl.py — Corrige (diff + patch) ia-das-ontology-clean.ttl depuis
data/BDD_Extraction.xlsx, et exporte en plus un .ttl par article.

Ne reconstruit PAS l'ABox : construit un graphe cible ligne par ligne, avec EXACTEMENT
le même schéma de prédicats et le même schéma d'URI que l'existant (Article ID /
Analysis ID de l'Excel = suffixes numériques des URI, identiques à ceux déjà utilisés
— vérifiés stables entre les deux versions de l'Excel). Ne corrige que les sujets
data:* dont le contenu diffère ; les sujets absents du nouvel Excel ne sont JAMAIS
supprimés, seulement reportés.

Lancer depuis la racine du repo :
    python -m ia_cad.tools.ontology.data_excel_to_ttl [--dry-run] [--article STEM]
"""
import argparse
import sys
import unicodedata
from datetime import date
from pathlib import Path
from urllib.parse import quote

import pandas as pd
from rdflib import Graph, Literal, URIRef
from rdflib.namespace import DCTERMS, RDF
from rdflib.plugins.serializers.nt import _nt_row

from ia_cad.paths import DATA_DIR, ONTOLOGY_DIR, REPO_ROOT, RESULTS_DIR


def na(val):
    """Return None for any missing/N.A. value."""
    if val is None:
        return None
    if isinstance(val, float):
        import math
        if math.isnan(val):
            return None
    s = str(val).strip()
    if s in ("N.A.", "N.A", "NA", "n.a.", "n/a", "nan", "NaN", "", "N/A"):
        return None
    return s


def ascii_slug(text: str) -> str:
    """Normalize unicode to ASCII (Abraş → Abras, Aleksić → Aleksic)."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def make_filename(authors_raw: str, year_raw) -> str:
    first_author = str(authors_raw).split(",")[0].strip()
    slug = ascii_slug(first_author).replace(" ", "")
    year_str = str(year_raw).strip()
    return f"{slug}.{year_str}.json"

EXCEL_PATH = DATA_DIR / "BDD_Extraction.xlsx"
TTL_PATH = ONTOLOGY_DIR / "Onto" / "ia-das-ontology-clean.ttl"
ARTICLES_DIR = ONTOLOGY_DIR / "Onto" / "articles"
REPORT_DIR = RESULTS_DIR / "comparisons"

D = "http://ns.inria.fr/iadas/data/"
I = "http://ns.inria.fr/iadas/ontology/"
SPORT = "http://ns.inria.fr/iadas/sport-vocab/"
ACAD = "http://ns.inria.fr/iadas/ACAD-vocab/"
MEAS = "http://ns.inria.fr/iadas/measurementTools-vocab/"
BIBO = "http://purl.org/ontology/bibo/"

KNOWN_CLASSES = [
    "SportPsychologyArticle", "Analysis", "Population", "Relations",
    "VariableDependante", "VariableIndependante",
    "AgeStatistics", "BMIStatistics", "ExerciseFrequencyStatistics",
    "YearsOfExperienceStatistics",
]

OWNERSHIP_PREDS = [
    I + "hasAnalysis", I + "hasPopulation", I + "hasRelation", I + "hasStatistics",
    I + "hasDependentVariable", I + "hasIndependentVariable",
]


def slug(text: str) -> str:
    """Même codec que le TTL existant : espaces -> '_', percent-encoding intégral
    (safe="" pour encoder aussi '/', ex. 'Track and field/Athletics')."""
    return quote(str(text).strip().replace(" ", "_"), safe="")


def clean(val) -> str:
    v = na(val)
    return v if v is not None else "N.A."


def clean_num(val) -> str:
    v = na(val)
    if v is None:
        return "N.A."
    try:
        f = float(v)
        return str(int(f)) if f.is_integer() else str(f)
    except ValueError:
        return v


def id_int(val) -> int:
    return int(float(val))


def d(local: str) -> URIRef:
    return URIRef(D + local)


def prop(local: str) -> URIRef:
    return URIRef(I + local)


# ─── Stems (noms de fichiers par article, cohérents avec les GT existants) ─────

def compute_stems(df: pd.DataFrame) -> tuple[dict, dict]:
    """({Article ID (int): stem}, {Article ID (int): [Analysis ID, ...]}) — même
    logique de nommage que make_filename() ci-dessus, avec désambiguïsation a/b/c
    en cas de collision (même auteur+année). La liste d'Analysis ID par article
    sert uniquement à regrouper les lignes pour l'export par article (le graphe
    lui-même ne déduplique pas Article_N, voir build_target_graph)."""
    filename_counts: dict = {}
    code_to_fname: dict = {}
    code_to_ids: dict = {}
    for article_id, group in df.groupby("Article ID"):
        r0 = group.iloc[0]
        fname = make_filename(str(r0["Authors"]), r0["Year"])  # "<Slug>.<Year>.json"
        filename_counts[fname] = filename_counts.get(fname, 0) + 1
        aid = id_int(article_id)
        code_to_fname[aid] = fname
        code_to_ids[aid] = [id_int(v) for v in group["Analysis ID"]]

    collision_tracker: dict = {}
    stems = {}
    for aid in sorted(code_to_fname.keys()):
        fname = code_to_fname[aid]
        if filename_counts[fname] > 1:
            base, _ext = fname.rsplit(".json", 1)
            idx = collision_tracker.get(fname, 0)
            suffix = chr(ord("a") + idx)
            collision_tracker[fname] = idx + 1
            stems[aid] = f"{base}{suffix}"
        else:
            stems[aid] = fname.removesuffix(".json")
    return stems, code_to_ids


# ─── Construction du graphe cible depuis l'Excel ──────────────────────────────

def add_variable(g: Graph, subj: URIRef, cls: str, name_raw, spec_raw, measure_raw):
    g.add((subj, RDF.type, prop(cls)))
    name = na(name_raw) or "N.A."
    g.add((subj, prop("variableName"), Literal(name)))
    g.add((subj, prop("specification"), Literal(clean(spec_raw))))
    measure = na(measure_raw) or "N.A."
    g.add((subj, prop("measure"), URIRef(MEAS + slug(measure))))
    g.add((subj, prop("refersToVariable"), URIRef(ACAD + slug(name))))


def add_relation(g: Graph, rel: URIRef, n: int, row):
    g.add((rel, RDF.type, prop("Relations")))
    g.add((rel, prop("relationDegreeSecondary"), Literal(clean(row["Degree of relationship"]))))

    vd = d(f"Variable_VD_{n}")
    g.add((rel, prop("hasDependentVariable"), vd))
    add_variable(g, vd, "VariableDependante", row["DEAB"],
                 row["Specifications of DEAB"], row["DEAB measure"])

    vi = d(f"Variable_VI_{n}")
    g.add((rel, prop("hasIndependentVariable"), vi))
    add_variable(g, vi, "VariableIndependante", row["Related_Factor"],
                 row["Specifications of related factor"], row["Related_Factor measure"])


_STATS = [
    ("AgeStats", "AgeStatistics", "Mean_Age", "Range_Age"),
    ("BmiStats", "BMIStatistics", "Mean_BMI", "Range_BMI"),
    ("ExFreqStats", "ExerciseFrequencyStatistics",
     "Mean_Exercise frequency", "Range_Exercise frequency"),
    ("ExpStats", "YearsOfExperienceStatistics",
     "Mean_Years of experience", "Range_Years of experience"),
]


def add_population(g: Graph, pop: URIRef, n: int, row):
    g.add((pop, RDF.type, prop("Population")))
    g.add((pop, prop("gender"), Literal(clean(row["Sex"]))))
    g.add((pop, prop("hasSubgroup"), Literal(clean(row["Population subgroup"]))))
    g.add((pop, prop("inclusionCriteria"), Literal(clean(row["Inclusion criteria"]))))
    g.add((pop, prop("population"), Literal(clean(row["Population"]))))
    g.add((pop, prop("sampleSize"), Literal(clean_num(row["N"]))))
    g.add((pop, prop("sportLevel"), Literal(clean(row["Sport level"]))))
    g.add((pop, prop("sportingPopulation"), Literal(clean(row["Sporting population"]))))

    for prefix, cls, mean_col, range_col in _STATS:
        s = d(f"{prefix}_{n}")
        g.add((pop, prop("hasStatistics"), s))
        g.add((s, RDF.type, prop(cls)))
        g.add((s, prop("hasMeanValue"), Literal(clean(row[mean_col]))))
        g.add((s, prop("hasRange"), Literal(clean(row[range_col]))))


def add_analysis(g: Graph, ana: URIRef, n: int, row):
    g.add((ana, RDF.type, prop("Analysis")))
    g.add((ana, prop("analysisId"), Literal(str(n))))
    g.add((ana, prop("authorConclusion"), Literal(clean(row["Authors' conclusions"]))))
    g.add((ana, prop("complexityOfAnalysis"), Literal(clean(row["Complexity of Analysis"]))))
    g.add((ana, prop("groupStatisticalAnalysis"),
           Literal(clean(row["Group of statistical analysis"]))))
    g.add((ana, prop("hasMediator"), Literal(clean(row["Mediator"]))))
    g.add((ana, prop("hasModerator"), Literal(clean(row["Moderator"]))))
    g.add((ana, prop("limites"), Literal(clean(row["Limits"]))))
    g.add((ana, prop("mediatorMeasure"), Literal(clean(row["Measure Mediator"]))))
    g.add((ana, prop("moderatorMeasure"), Literal(clean(row["Measure Moderator"]))))
    g.add((ana, prop("numberOfSportStudied"), Literal(clean(row["Number of sport studied"]))))
    g.add((ana, prop("perspectives"), Literal(clean(row["Perspectives"]))))
    g.add((ana, prop("relationDegree"), Literal(clean(row["Degree of relationship"]))))
    g.add((ana, prop("relationDirection"),
           Literal(clean(row["Direction of the relationship"]))))
    g.add((ana, prop("sampleSizeMobilized"),
           Literal(clean_num(row["N mobilized in analyses"]))))
    g.add((ana, prop("sportPracticeType"), Literal(clean(row["Type of sport practice"]))))
    g.add((ana, prop("typeOfAnalysis"), Literal(clean(row["Type of analysis"]))))

    sport_name = na(row.get("Sport name")) or "N.A."
    g.add((ana, prop("hasSport"), URIRef(SPORT + slug(sport_name))))

    pop = d(f"Population_{n}")
    g.add((ana, prop("hasPopulation"), pop))
    add_population(g, pop, n, row)

    rel = d(f"Relations_{n}")
    g.add((ana, prop("hasRelation"), rel))
    add_relation(g, rel, n, row)


def build_target_graph(df: pd.DataFrame) -> Graph:
    """Un Article_<AnalysisID> PAR LIGNE, pas dédupliqué par Article ID.

    Vérifié sur l'ABox actuel : 2373 sujets Article_N distincts pour 2373 lignes
    (216 articles réels) — chaque ligne mint son propre nœud Article, dupliquant
    les champs bibliographiques, avec un seul lien hasAnalysis. C'est la convention
    déjà en place (probablement un artefact du pipeline RML d'origine) ; on la
    reproduit à l'identique pour rester une correction, pas une restructuration.
    Le regroupement par article réel (pour l'export par article) se fait à part,
    via `compute_stems`/`stem_to_analysis_ids`, sans toucher à cette structure.
    """
    g = Graph()
    for _, row in df.iterrows():
        n = id_int(row["Analysis ID"])
        art = d(f"Article_{n}")
        g.add((art, RDF.type, prop("SportPsychologyArticle")))
        g.add((art, DCTERMS.title, Literal(clean(row["Title"]))))
        g.add((art, DCTERMS.creator, Literal(clean(row["Authors"]))))
        g.add((art, DCTERMS.date, Literal(clean_num(row["Year"]))))
        g.add((art, URIRef(BIBO + "doi"), Literal(clean(row["DOI"]))))
        g.add((art, URIRef(BIBO + "journal"), Literal(clean(row["Journal"]))))
        g.add((art, prop("country"), Literal(clean(row["Country"]))))
        g.add((art, prop("continent"), Literal(clean(row["Continent"]))))
        g.add((art, prop("studyType"), Literal(clean(row["Types of study"]))))

        ana = d(f"Analysis_{n}")
        g.add((art, prop("hasAnalysis"), ana))
        add_analysis(g, ana, n, row)
    return g


# ─── Diff + patch ──────────────────────────────────────────────────────────────

def selectable_subjects(g: Graph) -> set:
    out = set()
    for cls in KNOWN_CLASSES:
        for s in g.subjects(RDF.type, prop(cls)):
            if str(s).startswith(D):
                out.add(s)
    return out


def diff_and_patch(current: Graph, target: Graph):
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
    ('AgeStats_1' vs 'AgeStats_10' : le '>' de fermeture s'intercale avant le
    chiffre suivant et inverse l'ordre). Trier les termes bruts reproduit l'ordre
    du fichier existant (vérifié : 'AgeStats_1' < 'AgeStats_10' en str brut).
    _nt_row garantit un encodage identique à graph.serialize(format='nt')."""
    triples = sorted(graph, key=lambda t: (str(t[0]), str(t[1]), str(t[2])))
    lines = [_nt_row(t).rstrip("\n") for t in triples]
    # newline="\n" : le fichier existant est en LF ; write_text traduirait sinon
    # vers os.linesep (CRLF sous Windows), gonflant artificiellement le diff.
    path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def _fmt_triple(t) -> str:
    _, p, o = t
    pred = str(p).rsplit("/", 1)[-1].rsplit("#", 1)[-1]
    return f"{pred} = {o}"


# ─── Export par article ────────────────────────────────────────────────────────

def article_closure(g: Graph, article_uri: URIRef) -> set:
    owned = {article_uri}
    frontier = [article_uri]
    while frontier:
        s = frontier.pop()
        for pred in OWNERSHIP_PREDS:
            for o in g.objects(s, URIRef(pred)):
                if o not in owned:
                    owned.add(o)
                    frontier.append(o)
    return owned


def write_article_files(g: Graph, stems: dict, code_to_ids: dict):
    """Un fichier par article RÉEL : union des closures de chaque Article_<n>
    dupliqué (n = chaque Analysis ID de l'article), voir build_target_graph."""
    ARTICLES_DIR.mkdir(parents=True, exist_ok=True)
    for aid, stem in stems.items():
        owned = set()
        for n in code_to_ids[aid]:
            art = d(f"Article_{n}")
            if (art, RDF.type, prop("SportPsychologyArticle")) in g:
                owned |= article_closure(g, art)
        if not owned:
            continue
        sub = Graph()
        for s in owned:
            for t in g.triples((s, None, None)):
                sub.add(t)
        write_sorted_nt(sub, ARTICLES_DIR / f"{stem}.ttl")


# ─── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description="Corrige le schéma de données depuis Excel.")
    ap.add_argument("--dry-run", action="store_true", help="N'écrit rien, affiche le résumé.")
    ap.add_argument("--article", help="Limite à un seul article (stem, ex: AbiKaram.2025).")
    args = ap.parse_args()

    print(f"Lecture {EXCEL_PATH.name} ...")
    df = pd.read_excel(EXCEL_PATH, sheet_name="data", header=0)
    df.columns = df.columns.str.strip()
    print(f"  {len(df)} lignes, {df['Article ID'].nunique()} articles")

    stems, code_to_ids = compute_stems(df)
    if args.article:
        aid = next((a for a, s in stems.items() if s == args.article), None)
        if aid is None:
            print(f"Article inconnu : {args.article}")
            return 1
        df = df[df["Article ID"] == aid]
        stems = {aid: stems[aid]}
        code_to_ids = {aid: code_to_ids[aid]}
        print(f"  restreint à {args.article} (Article ID {aid}, {len(df)} lignes)")

    print(f"Chargement {TTL_PATH.name} (peut prendre ~1 min, fichier volumineux) ...")
    current = Graph()
    current.parse(str(TTL_PATH), format="turtle")
    print(f"  {len(current)} triplets")

    target = build_target_graph(df)
    print(f"  {len(selectable_subjects(target))} sujets construits depuis l'Excel")

    corrections, ajouts, orphelins = diff_and_patch(current, target)

    print(f"\nSujets corrigés : {len(corrections)}, ajoutés : {len(ajouts)}, "
          f"orphelins : {len(orphelins)}")
    print("\n--- échantillon corrections (5) ---")
    for s, removed, added in corrections[:5]:
        print(f"  ~ {s}")
        for t in sorted(removed, key=str)[:5]:
            print(f"      - {_fmt_triple(t)}")
        for t in sorted(added, key=str)[:5]:
            print(f"      + {_fmt_triple(t)}")
    print("\n--- ajoutés (10 premiers) ---")
    for s in ajouts[:10]:
        print(f"  + {s}")
    print(f"\n--- orphelins ({len(orphelins)}, 15 premiers) ---")
    for s in orphelins[:15]:
        print(f"  ? {s}")

    lines = [
        "=" * 70,
        f"data_excel_to_ttl — correction depuis {EXCEL_PATH.name}",
        "=" * 70,
        f"Sujets corrigés : {len(corrections)}",
        f"Sujets ajoutés  : {len(ajouts)}",
        f"Sujets orphelins (absents du nouvel Excel, NON supprimés) : {len(orphelins)}",
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

    if args.dry_run:
        print("\n--dry-run : rien n'a été écrit.")
        return 0

    write_sorted_nt(current, TTL_PATH)
    print(f"\nÉcrit : {TTL_PATH.relative_to(REPO_ROOT)}")

    write_article_files(current, stems, code_to_ids)
    print(f"Export par article : {ARTICLES_DIR.relative_to(REPO_ROOT)}/ "
          f"({len(stems)} fichiers)")

    rp_dir = REPORT_DIR / f"{date.today():%Y-%m-%d}"
    rp_dir.mkdir(parents=True, exist_ok=True)
    rp = rp_dir / "data_ttl_correction_report.txt"
    rp.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Rapport : {rp.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
