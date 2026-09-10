"""
abox_to_gt.py — Génère des ground truth Type depuis le graphe de connaissances
peuplé (Onto/ia-das-ontology-clean.ttl), intégralement par requêtes SPARQL.

Écrit/réécrit sur place dans ground_truth/, LA RÉFÉRENCE.

Les classifications de variables sont DÉRIVÉES de l'ancrage URI
(`iadas:refersToVariable` → concept ACAD-vocab) en remontant skos:broader dans le
graphe de hiérarchie — même logique que l'entity linking. Le sport vient de l'URI
`iadas:hasSport` (localname = libellé annoté ; catégorie via la hiérarchie quand
l'URI y existe).

Toute la récupération passe par g.query() (SPARQL 1.1) : une requête « squelette »
(Article → Analysis → Population/Relations/Sport), une requête de champs par classe
(VALUES sur les prédicats), une requête DOI. Aucun g.objects()/g.triples().

Mapping Article_N → stem : par DOI (repli titre normalisé) contre les stems déjà
présents dans ground_truth/, avec repli sur common/config/article_index.json pour
un stem pas encore régénéré (index figé, extrait une fois de l'ancien GT JSON).

Lancer (le package est installé, `pip install -e .`) :
    iacad-abox-to-gt [--article STEM] [--dry-run]

Rapport (articles non mappés, URIs non résolues) :
results/comparisons/<date>_abox_gt_report.txt
"""
import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path
from urllib.parse import unquote

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from rdflib import Graph

from ia_cad.common.linking.sparql_linking import _broader_chain, _label, _category_label
from ia_cad.common.corpus import GT_SPLITS, find_gt
from ia_cad.paths import ARTICLE_INDEX, GROUND_TRUTH_DIR, ONTOLOGY_DIR, REPO_ROOT, RESULTS_DIR

ABOX_PATH = ONTOLOGY_DIR / "Onto" / "ia-das-ontology-clean.ttl"
ARTICLE_INDEX_PATH = ARTICLE_INDEX
OUT_DIR = GROUND_TRUTH_DIR
REPORT_DIR = RESULTS_DIR / "comparisons"

I = "http://ns.inria.fr/iadas/ontology/"
_NA = {"", "N.A.", "NA", "N/A", "None", "null"}

# Champs scalaires/liens récupérés par classe (une requête SPARQL par classe).
_FIELDS = {
    "Analysis": [
        "sportPracticeType", "numberOfSportStudied", "typeOfAnalysis",
        "authorConclusion", "limites", "perspectives",
        "hasMediator", "mediatorMeasure", "hasModerator", "moderatorMeasure",
        "sampleSizeMobilized", "relationDegree", "relationDirection",
    ],
    "Population": [
        "sportLevel", "gender", "sampleSize", "inclusionCriteria",
        "population", "hasSubgroup", "sportingPopulation",
    ],
    "SportPsychologyArticle": ["country", "studyType"],
    "Relations": ["relationDegreeSecondary", "hasDependentVariable", "hasIndependentVariable"],
    "VariableDependante": ["variableName", "measure", "specification", "refersToVariable"],
    "VariableIndependante": ["variableName", "measure", "specification", "refersToVariable"],
}


def _localname_text(uri) -> str:
    """URI de concept → texte lisible (localname décodé, underscores → espaces)."""
    return unquote(str(uri).rsplit("/", 1)[-1]).replace("_", " ").strip()


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(s).lower()).strip()


def _clean(v) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return None if s in _NA else s


def _na_uri(uri) -> bool:
    """True si l'URI est une annotation vide frappée en URI par le pipeline RML
    (ex. ACAD-vocab/N.A., sport-vocab/N.A.) — à traiter comme absente."""
    return uri is None or _localname_text(uri) in _NA


# ─── Chargement ABox + index stems ────────────────────────────────────────────

def load_abox() -> Graph:
    print(f"Parsing ABox {ABOX_PATH.name} (24 Mo, ~1 min) ...")
    g = Graph()
    g.parse(str(ABOX_PATH), format="turtle")
    print(f"  {len(g)} triplets")
    return g


def _load_article_index() -> dict:
    """common/config/article_index.json : repli figé (doi/titre→stem, stem→split) pour un
    stem qui n'existe pas encore dans ground_truth/ — extrait une fois de l'ancien GT
    JSON avant sa suppression, ne représente donc que les 216 stems d'origine."""
    if not ARTICLE_INDEX_PATH.exists():
        return {"by_doi": {}, "by_title": {}, "split": {}}
    return json.loads(ARTICLE_INDEX_PATH.read_text(encoding="utf-8"))


def _out_path(stem: str, index: dict) -> Path:
    """Sortie ground_truth : même sous-dossier (train/test) qu'un fichier existant.

    Un fichier existant est réécrit sur place ; sinon on suit le split connu de
    common/config/article_index.json ; à défaut, écriture à plat dans OUT_DIR.
    """
    existing = find_gt(OUT_DIR, stem)
    if existing is not None:
        return existing
    sub = index.get("split", {}).get(stem, "")
    d = OUT_DIR / sub if sub in GT_SPLITS else OUT_DIR
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{stem}.json"


def load_stem_index(index: dict) -> tuple[dict, dict]:
    """{doi_norm: stem} et {title_norm: stem} depuis common/config/article_index.json.

    Le schéma Type (ground_truth/) ne porte ni DOI ni titre (seulement `_article` =
    le stem), donc l'index figé reste l'unique source pour rattacher un article
    de l'ABox à un stem existant."""
    return index.get("by_doi", {}), index.get("by_title", {})


# ─── Récupération SPARQL ──────────────────────────────────────────────────────

def collect_rows(g: Graph) -> dict[str, list[dict]]:
    """Squelette : lignes (Article, Analysis, Population, Relations, Sport)
    groupées par titre normalisé. Une ligne ABox = une relation annotée."""
    rows = g.query(
        """
        SELECT ?art ?title ?ana ?pop ?rel ?sport WHERE {
          ?art a <%(I)sSportPsychologyArticle> ;
               <http://purl.org/dc/terms/title> ?title ;
               <%(I)shasAnalysis> ?ana .
          ?ana <%(I)shasPopulation> ?pop ;
               <%(I)shasRelation> ?rel ;
               <%(I)shasSport> ?sport .
        }
        """ % {"I": I})
    grouped: dict[str, list[dict]] = defaultdict(list)
    for art, title, ana, pop, rel, sport in rows:
        grouped[_norm(title)].append(
            {"art": art, "ana": ana, "pop": pop, "rel": rel, "sport": sport})
    return grouped


def fetch_fields(g: Graph, class_local: str, preds: list[str]) -> dict:
    """{sujet: {pred_local: valeur}} pour une classe, en UNE requête SPARQL.

    VALUES borne les prédicats ; ORDER BY fige la valeur retenue quand un sujet
    a plusieurs valeurs pour un même prédicat (le premier gagne — déterministe).
    """
    values = " ".join(f"<{I}{p}>" for p in preds)
    rows = g.query(
        "SELECT ?s ?p ?o WHERE { ?s a <%s%s> ; ?p ?o . VALUES ?p { %s } } "
        "ORDER BY ?s ?p ?o" % (I, class_local, values))
    out: dict = defaultdict(dict)
    for s, p, o in rows:
        out[s].setdefault(str(p).rsplit("/", 1)[-1], o)
    return out


def fetch_dois(g: Graph) -> dict:
    """{article: doi} — tout prédicat dont l'URI se termine par '/doi'
    (dcterms:doi, dc:doi ou iadas:doi selon les exports)."""
    rows = g.query(
        """
        SELECT ?art ?doi WHERE {
          ?art a <%(I)sSportPsychologyArticle> ; ?p ?doi .
          FILTER(STRENDS(STR(?p), "/doi"))
        } ORDER BY ?art ?doi
        """ % {"I": I})
    out: dict = {}
    for art, doi in rows:
        out.setdefault(art, str(doi).strip().lower())
    return out


def _cf(fields: dict, subj, pred_local: str) -> str | None:
    """Valeur nettoyée d'un champ pré-chargé (None si absente ou 'N.A.')."""
    return _clean(fields.get(subj, {}).get(pred_local))


# ─── Blocs GT ─────────────────────────────────────────────────────────────────

def build_sport_block(rows: list[dict], ana_f: dict, pop_f: dict, report: dict) -> list[dict]:
    names, levels, practices, subcats = [], [], [], []
    multiple = False
    for r in rows:
        lvl = _cf(pop_f, r["pop"], "sportLevel")
        if lvl and lvl not in levels:
            levels.append(lvl)
        pr = _cf(ana_f, r["ana"], "sportPracticeType")
        if pr and pr not in practices:
            practices.append(pr)
        if (_cf(ana_f, r["ana"], "numberOfSportStudied") or "").lower() == "multiple":
            multiple = True
        if _na_uri(r["sport"]):          # annotation vide (sport-vocab/N.A.) : pas de sport
            continue
        name = _localname_text(r["sport"])
        if name and name not in names:
            names.append(name)
        subcat = _category_label(r["sport"])  # via hiérarchie (SPARQL), si l'URI y existe
        if subcat and subcat not in subcats:
            subcats.append(subcat)
        if subcat is None:
            report["sport_unresolved"].add(_localname_text(r["sport"]))

    if not subcats:
        subcategory = "Multisport" if multiple else None
    elif len(subcats) == 1 and not multiple:
        subcategory = subcats[0]
    else:
        subcategory = "Multisport"

    return [
        {"predicate": "iadas:sportName", "object": "; ".join(names) or None},
        {"predicate": "iadas:sportLevel", "object": "; ".join(levels) or None},
        {"predicate": "iadas:sportPracticeType", "object": "; ".join(practices) or None},
        {"predicate": "iadas:sportSubcategory", "object": subcategory},
    ]


def build_variable_triplets(var, which: str, var_f: dict, report: dict) -> list[dict]:
    """Triplets V1/V2 : nom + mesure (ABox) puis chaîne dérivée de refersToVariable."""
    triplets = [
        {"predicate": f"iadas:{which}", "object": _cf(var_f, var, "variableName")},
    ]
    measure = var_f.get(var, {}).get("measure")
    triplets.append({"predicate": "iadas:measure",
                     "object": None if _na_uri(measure) else _localname_text(measure)})
    spec = _cf(var_f, var, "specification")
    if spec:
        triplets.append({"predicate": "iadas:specification", "object": spec})

    concept = var_f.get(var, {}).get("refersToVariable")
    if _na_uri(concept):                 # annotation vide (ACAD-vocab/N.A.) : pas de chaîne
        return triplets
    chain = _broader_chain(concept)
    labels = [_label(u) for u in chain]
    if any(l is None for l in labels):
        report["var_unresolved"].add(_localname_text(concept))
        return triplets
    # racine = hasCategory ; intermédiaires + feuille = subClass1..n ; feuille = finalClass
    for idx, lbl in enumerate(labels[1:], start=1):
        triplets.append({"predicate": f"iadas:subClass{idx}", "object": lbl,
                         "_source": "classifier"})
    if len(labels) > 1:
        triplets.append({"predicate": "iadas:finalClass", "object": labels[-1],
                         "_source": "classifier"})
    triplets.append({"predicate": "iadas:hasCategory", "object": labels[0],
                     "_source": "classifier"})
    return triplets


_R_RE = re.compile(r"(?<![A-Za-z0-9])r\s*=\s*(-?\d*\.?\d+)", re.I)
_R2_RE = re.compile(r"R\s*(?:2|²)\s*=\s*(-?\d*\.?\d+)", re.I)
_BETA_RE = re.compile(r"(?:β|beta)\s*=\s*(-?\d*\.?\d+)", re.I)
_P_RE = re.compile(r"p\s*([<=>]\s*\.?\d*\.?\d+)", re.I)


def build_stats(row: dict, rel_f: dict, ana_f: dict) -> list[dict]:
    """Parse relationDegreeSecondary (repli relationDegree) → stats numériques."""
    raw = _cf(rel_f, row["rel"], "relationDegreeSecondary") \
        or _cf(ana_f, row["ana"], "relationDegree")
    stats: list[dict] = []
    if raw:
        if (m := _R2_RE.search(raw)):
            stats.append({"predicate": "iadas:degreR2", "object": float(m.group(1))})
        # retirer les matchs R2 pour ne pas les reprendre comme r
        raw_wo_r2 = _R2_RE.sub(" ", raw)
        if (m := _R_RE.search(raw_wo_r2)):
            stats.append({"predicate": "iadas:degreR", "object": float(m.group(1))})
        if (m := _BETA_RE.search(raw)):
            stats.append({"predicate": "iadas:degreBeta", "object": float(m.group(1))})
        if (m := _P_RE.search(raw)):
            stats.append({"predicate": "iadas:signeP",
                          "object": "p" + m.group(1).replace(" ", "")})
        elif re.search(r"\bN\.?S\.?\b", raw, re.I):
            stats.append({"predicate": "iadas:signeP", "object": "N.S."})
    direction = _cf(ana_f, row["ana"], "relationDirection")
    if direction == "+":
        stats.append({"predicate": "iadas:resultatRelation", "object": "positive"})
    elif direction == "-":
        stats.append({"predicate": "iadas:resultatRelation", "object": "negative"})
    return stats


def build_analysis_block(rows: list[dict], ana_f: dict) -> list[dict]:
    """Premier non-vide parmi les lignes pour chaque champ d'analyse."""
    def first(pred: str):
        for r in rows:
            v = _cf(ana_f, r["ana"], pred)
            if v:
                return v
        return None

    out = []
    mapping = [
        ("typeOfAnalysis", "iadas:typeOfAnalysis"),
        ("authorConclusion", "iadas:authorConclusion"),
        ("limites", "iadas:limites"),
        ("perspectives", "iadas:perspectives"),
        ("hasMediator", "iadas:hasMediator"),
        ("mediatorMeasure", "iadas:mediatorMeasure"),
        ("hasModerator", "iadas:hasModerator"),
        ("moderatorMeasure", "iadas:moderatorMeasure"),
    ]
    for src, pred in mapping:
        v = first(src)
        if v is not None:
            out.append({"predicate": pred, "object": v})
    n = first("sampleSizeMobilized")
    if n is not None:
        out.append({"predicate": "iadas:sampleSizeMobilized",
                    "object": int(n) if str(n).isdigit() else n})
    return out


def build_population_block(rows: list[dict], pop_f: dict) -> list[dict]:
    """Premier non-vide parmi les lignes pour chaque champ de population — hors sportLevel,
    déjà consommé séparément par build_sport_block()."""
    def first(pred: str):
        for r in rows:
            v = _cf(pop_f, r["pop"], pred)
            if v:
                return v
        return None

    out = []
    mapping = [
        ("gender", "iadas:gender"),
        ("inclusionCriteria", "iadas:inclusionCriteria"),
        ("population", "iadas:population"),
        ("hasSubgroup", "iadas:hasSubgroup"),
        ("sportingPopulation", "iadas:sportingPopulation"),
    ]
    for src, pred in mapping:
        v = first(src)
        if v is not None:
            out.append({"predicate": pred, "object": v})
    n = first("sampleSize")
    if n is not None:
        out.append({"predicate": "iadas:sampleSize",
                    "object": int(n) if str(n).isdigit() else n})
    return out


def build_bibliography_block(art, art_f: dict) -> list[dict]:
    """Champs bibliographiques directs de SportPsychologyArticle (un seul sujet : l'article,
    contrairement aux autres blocs qui agrègent plusieurs lignes Analysis/Population/Relations)."""
    out = []
    for src, pred in (("country", "iadas:country"), ("studyType", "iadas:studyType")):
        v = _cf(art_f, art, src)
        if v is not None:
            out.append({"predicate": pred, "object": v})
    return out


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description="GT Type depuis l'ABox (SPARQL).")
    ap.add_argument("--article", help="Restreindre à un stem (ex: AbiKaram.2025)")
    ap.add_argument("--dry-run", action="store_true", help="N'écrit aucun fichier")
    args = ap.parse_args()

    g = load_abox()
    index = _load_article_index()
    by_doi, by_title = load_stem_index(index)
    grouped = collect_rows(g)
    print(f"  {len(grouped)} articles distincts dans l'ABox")

    print("Fetching fields per class (SPARQL) ...")
    ana_f = fetch_fields(g, "Analysis", _FIELDS["Analysis"])
    pop_f = fetch_fields(g, "Population", _FIELDS["Population"])
    art_f = fetch_fields(g, "SportPsychologyArticle", _FIELDS["SportPsychologyArticle"])
    rel_f = fetch_fields(g, "Relations", _FIELDS["Relations"])
    var_f = fetch_fields(g, "VariableDependante", _FIELDS["VariableDependante"])
    var_f.update(fetch_fields(g, "VariableIndependante", _FIELDS["VariableIndependante"]))
    dois = fetch_dois(g)

    report = {"sport_unresolved": set(), "var_unresolved": set(),
              "unmatched": [], "written": 0}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for title_norm, rows in sorted(grouped.items()):
        # stem : DOI d'abord, titre sinon
        doi = dois.get(rows[0]["art"])
        stem = by_doi.get(doi) if doi else None
        if stem is None:
            stem = by_title.get(title_norm)
        if stem is None:
            report["unmatched"].append(str(rows[0]["art"]))
            continue
        if args.article and stem != args.article:
            continue

        relations = []
        for row in sorted(rows, key=lambda r: str(r["rel"])):
            vd = rel_f.get(row["rel"], {}).get("hasDependentVariable")
            vi = rel_f.get(row["rel"], {}).get("hasIndependentVariable")
            if vd is None or vi is None:
                continue
            relations.append({
                "V1": {"triplets": build_variable_triplets(vd, "V1", var_f, report)},
                "V2": {"triplets": build_variable_triplets(vi, "V2", var_f, report)},
                "stats": build_stats(row, rel_f, ana_f),
            })

        doc = {
            "_article": stem,
            "_source": "abox",
            "Sport": build_sport_block(rows, ana_f, pop_f, report),
            "Relations": relations,
            "Analysis": build_analysis_block(rows, ana_f),
            "Population": build_population_block(rows, pop_f),
            "Bibliographic": build_bibliography_block(rows[0]["art"], art_f),
        }
        if not args.dry_run:
            out = _out_path(stem, index)
            out.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
        report["written"] += 1

    # rapport
    lines = [
        "=" * 70,
        f"abox_to_gt — {report['written']} GT écrits dans {OUT_DIR.relative_to(REPO_ROOT)}",
        "=" * 70,
        f"Articles ABox non mappés à un stem : {len(report['unmatched'])}",
        *[f"   {u}" for u in report["unmatched"]],
        "",
        f"Sports sans catégorie dans la hiérarchie ({len(report['sport_unresolved'])}) "
        "→ sportSubcategory dérivée Multisport/None :",
        *[f"   {s}" for s in sorted(report["sport_unresolved"])[:40]],
        "",
        f"Concepts variable non résolus dans le graphe d'entity linking "
        f"({len(report['var_unresolved'])}) → pas de chaîne dérivée :",
        *[f"   {v}" for v in sorted(report["var_unresolved"])],
    ]
    print("\n".join(lines[:20]))
    if not args.dry_run:
        rp_dir = REPORT_DIR / f"{date.today():%Y-%m-%d}"
        rp_dir.mkdir(parents=True, exist_ok=True)
        rp = rp_dir / "abox_gt_report.txt"
        rp.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"\nRapport complet : {rp.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
