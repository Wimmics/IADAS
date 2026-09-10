"""
relations_variants.py — Harness A/B pour le bloc relations seul : mesure si un
changement de prompt/parseur de tableau améliore vraiment l'extraction, en
comparant différentes compositions de texte d'entrée (tableaux seuls vs
tableaux + texte) et/ou différentes versions du code, taguées et comparables.

Ne modifie rien à extract.py / corr_matrix.py : _section_text() et
_process_relations() sont déjà assez génériques pour être appelées directement
avec une liste de sections custom. Les runs écrivent dans un espace SÉPARÉ de
resultats/Type/<date>/ (jamais mélangés à l'historique des extractions
officielles) : resultats/relations_experiments/<tag>/<date>/<stem>_type.json.

Sur le patron de tools/audit_evidence.py : fonctions pures (run_variant_one,
compute_run_summary, compute_diff, list_tags) réutilisées à la fois par la CLI
et par le front (webapp/app.py) — aucune logique dupliquée entre les deux.

Usage (depuis la racine du repo) :
    iacad-relations-variants run --tag baseline --variant tables+texte
    iacad-relations-variants run --tag tables-only --variant tables
    iacad-relations-variants run --tag full --variant tables+texte --full-corpus
    iacad-relations-variants diff --tag-a baseline --tag-b tables-only
"""
import argparse
import json
import sys
from datetime import date

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from ia_cad.extraction import extract as extract_mod
from ia_cad.tools.evaluation.compare_results import compare_type, _prf1, table_bearing_stems
from ia_cad.paths import GROUND_TRUTH_DIR, RESULTS_DIR

_GT_TYPE  = GROUND_TRUTH_DIR
_EXP_DIR  = RESULTS_DIR / "relations_experiments"

VARIANTS = {
    "tables":       ["tables"],
    "texte":        ["abstract", "results"],  # sans tableau — même sections que tables+texte, tableaux en moins
    "tables+texte": extract_mod._RELATIONS_SECTIONS,  # ["abstract", "results", "tables"] — comportement actuel
}



def full_corpus_stems() -> list[str]:
    """Les 198 stems du corpus GT TEST (jamais train — un train/few-shot article
    scoré contre son propre GT gonflerait artificiellement le score, cf. mémoire
    'contamination few-shot dans compare_results.py')."""
    return sorted(p.stem for p in (_GT_TYPE / "test").glob("*.json"))


def fast_subset(n: int = 16) -> list[str]:
    """Sous-ensemble rapide pour itérer sur un portable CPU-only : les N premiers
    stems (ordre alphabétique, déterministe) de table_bearing_stems() — déjà
    scopés au corpus test, jamais besoin de maintenir une liste à la main."""
    return table_bearing_stems()[:n]


# ─── Un article ─────────────────────────────────────────────────────────────

def run_variant_one(
    stem: str, variant: str, model_name: str, model_cfg: dict,
    no_factcheck: bool = False, debug: bool = False, include_keywords: bool = False,
) -> dict:
    """Extrait UNIQUEMENT le bloc relations pour un article, avec le texte
    composé selon `variant` ("tables" ou "tables+texte", voir VARIANTS).

    include_keywords : ajoute le RECALL CHECK par mots-clés qualitatifs
    (corr_matrix.scan_keyword_candidates(), voir extract._detected_stats_block)
    — expérimental, axe orthogonal à `variant`, désactivé par défaut.

    Retourne {"stem", "relations": [...], "n_relations", "n_rejected"} — pas
    d'écriture disque ici (fait par l'appelant), pour rester testable en isolation.
    """
    if variant not in VARIANTS:
        raise ValueError(f"variant inconnu : {variant!r} (attendu : {list(VARIANTS)})")

    path = extract_mod._ARTICLES / f"{stem}.pdf"
    if not path.exists():
        raise FileNotFoundError(f"article introuvable : {path}")

    full_text = extract_mod.read_file(path)
    schema    = extract_mod.load_schema()
    text      = extract_mod._section_text(path, full_text, VARIANTS[variant])

    relations, rejected = extract_mod._process_relations(
        text, model_name, model_cfg, schema, no_factcheck, debug, include_keywords,
    )
    return {
        "stem": stem, "relations": relations,
        "n_relations": len(relations), "n_rejected": len(rejected),
    }


def _score_one(stem: str, relations: list[dict]) -> dict | None:
    """Score les relations d'un article contre son GT — uniquement s'il est dans
    le corpus GT TEST (jamais train/few-shot, cf. mémoire 'contamination few-shot
    dans compare_results.py' : un article vu en exemple gonflerait le score)."""
    gt_path = _GT_TYPE / "test" / f"{stem}.json"
    if not gt_path.exists():
        return None
    gt = json.loads(gt_path.read_text(encoding="utf-8"))
    report = compare_type({"Relations": relations}, gt)
    precision, recall, f1 = _prf1(report["rel_counts"])
    return {
        "stem": stem,
        "n_matched": report["n_matched"],
        "n_gt_rels": report["n_gt_rels"],
        "n_res_rels": report["n_res_rels"],
        "precision": round(precision, 1),
        "recall": round(recall, 1),
        "f1": round(f1, 1),
    }


# ─── Un run (plusieurs articles, un tag) ────────────────────────────────────

def compute_run_summary(
    tag: str, variant: str, stems: list[str], model_name: str, model_cfg: dict,
    no_factcheck: bool = False, debug: bool = False, include_keywords: bool = False,
    on_article_start=None, on_article_done=None,
) -> dict:
    """Lance run_variant_one() sur chaque stem, écrit chaque résultat dans
    relations_experiments/<tag>/<run_date>/<stem>_type.json, score contre le GT
    test, écrit relations_experiments/<tag>/summary.json et le retourne.

    on_article_start(stem) / on_article_done(stem, result_or_none, error_or_none) :
    callbacks optionnels appelés avant/après chaque article (utilisés par jobs.py
    pour la progression du job front — voir webapp/jobs.py::_run_relations_variant_job).
    """
    run_date = date.today().isoformat()
    out_root = _EXP_DIR / tag / run_date
    out_root.mkdir(parents=True, exist_ok=True)
    (_EXP_DIR / tag).mkdir(parents=True, exist_ok=True)
    summary_path = _EXP_DIR / tag / "summary.json"

    per_article: list[dict] = []
    errors: list[dict] = []

    def _write_summary(partial: bool) -> dict:
        n = len(per_article)
        agg = {
            "n_matched":  sum(r["n_matched"] for r in per_article),
            "n_gt_rels":  sum(r["n_gt_rels"] for r in per_article),
            "n_res_rels": sum(r["n_res_rels"] for r in per_article),
            "precision":  round(sum(r["precision"] for r in per_article) / n, 1) if n else 0.0,
            "recall":     round(sum(r["recall"] for r in per_article) / n, 1) if n else 0.0,
            "f1":         round(sum(r["f1"] for r in per_article) / n, 1) if n else 0.0,
        }
        summary = {
            "tag": tag, "variant": variant, "include_keywords": include_keywords,
            "date": run_date, "model": model_name, "_partial": partial,
            "stems": stems, "n_articles": n, "n_planned": len(stems), "n_errors": len(errors),
            "aggregate": agg, "per_article": per_article, "errors": errors,
        }
        summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        return summary

    for stem in stems:
        if on_article_start:
            on_article_start(stem)
        try:
            result = run_variant_one(stem, variant, model_name, model_cfg, no_factcheck, debug, include_keywords)
        except Exception as e:
            errors.append({"stem": stem, "error": str(e)})
            if on_article_done:
                on_article_done(stem, None, str(e))
            _write_summary(partial=True)
            continue

        out_path = out_root / f"{stem}_type.json"
        out_path.write_text(
            json.dumps({"_article": stem, "_tag": tag, "_variant": variant,
                        "_include_keywords": include_keywords,
                        "Relations": result["relations"]}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        score = _score_one(stem, result["relations"])
        row = {**(score or {"stem": stem, "n_matched": 0, "n_gt_rels": 0, "n_res_rels": result["n_relations"],
                             "precision": 0.0, "recall": 0.0, "f1": 0.0}),
               "n_rejected": result["n_rejected"]}
        per_article.append(row)
        if on_article_done:
            on_article_done(stem, row, None)
        # Écrit après CHAQUE article (pas seulement à la fin) : une interruption manuelle
        # sur un run à 50 articles garde un agrégat exploitable plutôt que d'en perdre la
        # trace (limite documentée dans relations_variants_findings.md du 24/08).
        _write_summary(partial=True)

    return _write_summary(partial=False)


# ─── Comparaison de deux runs ────────────────────────────────────────────────

def list_tags() -> list[dict]:
    """Métadonnées de chaque tag déjà lancé (pour peupler les selects du front)."""
    if not _EXP_DIR.exists():
        return []
    out = []
    keys = ("tag", "variant", "include_keywords", "date", "model", "n_articles", "n_errors", "aggregate")
    for d in sorted(_EXP_DIR.iterdir()):
        f = d / "summary.json"
        if f.exists():
            s = json.loads(f.read_text(encoding="utf-8"))
            out.append({k: s.get(k, False if k == "include_keywords" else None) for k in keys})
    return out


def compute_diff(tag_a: str, tag_b: str) -> dict:
    """Delta par article + en agrégat entre deux tags déjà lancés.

    Compare sur l'intersection des stems si les deux tags ne couvrent pas
    exactement le même ensemble (avertit via "stems_only_in_a"/"stems_only_in_b"
    plutôt que d'échouer)."""
    path_a, path_b = _EXP_DIR / tag_a / "summary.json", _EXP_DIR / tag_b / "summary.json"
    if not path_a.exists():
        raise FileNotFoundError(f"tag inconnu : {tag_a!r}")
    if not path_b.exists():
        raise FileNotFoundError(f"tag inconnu : {tag_b!r}")
    sa, sb = json.loads(path_a.read_text(encoding="utf-8")), json.loads(path_b.read_text(encoding="utf-8"))

    by_stem_a = {r["stem"]: r for r in sa["per_article"]}
    by_stem_b = {r["stem"]: r for r in sb["per_article"]}
    common = sorted(set(by_stem_a) & set(by_stem_b))

    per_article = []
    for stem in common:
        ra, rb = by_stem_a[stem], by_stem_b[stem]
        per_article.append({
            "stem": stem,
            "precision_delta": round(rb["precision"] - ra["precision"], 1),
            "recall_delta":    round(rb["recall"] - ra["recall"], 1),
            "f1_delta":        round(rb["f1"] - ra["f1"], 1),
            "n_matched_a": ra["n_matched"], "n_matched_b": rb["n_matched"], "n_gt_rels": ra["n_gt_rels"],
        })

    def _avg(key):
        return round(sum(r[key] for r in per_article) / len(per_article), 1) if per_article else 0.0

    return {
        "tag_a": tag_a, "tag_b": tag_b,
        "n_common": len(common),
        "stems_only_in_a": sorted(set(by_stem_a) - set(by_stem_b)),
        "stems_only_in_b": sorted(set(by_stem_b) - set(by_stem_a)),
        "aggregate_delta": {
            "precision": _avg("precision_delta"), "recall": _avg("recall_delta"), "f1": _avg("f1_delta"),
        },
        "per_article": per_article,
    }


# ─── CLI ──────────────────────────────────────────────────────────────────────

def _print_summary(summary: dict) -> None:
    a = summary["aggregate"]
    print(f"\ntag={summary['tag']!r}  variant={summary['variant']!r}  "
          f"mots-cles={summary.get('include_keywords', False)}  "
          f"{summary['n_articles']} article(s)  ({summary['n_errors']} erreur(s))")
    print(f"  relations matchées : {a['n_matched']}/{a['n_gt_rels']}  "
          f"(extrait={a['n_res_rels']})")
    print(f"  champs (matchées)  : precision={a['precision']}%  recall={a['recall']}%  f1={a['f1']}%")
    print(f"\n  -> resultats/relations_experiments/{summary['tag']}/summary.json")


def _print_diff(d: dict) -> None:
    print(f"\n{d['tag_a']!r} -> {d['tag_b']!r}  ({d['n_common']} article(s) commun(s))")
    if d["stems_only_in_a"]:
        print(f"  (ignorés, absents de {d['tag_b']!r}) : {d['stems_only_in_a']}")
    if d["stems_only_in_b"]:
        print(f"  (ignorés, absents de {d['tag_a']!r}) : {d['stems_only_in_b']}")
    ad = d["aggregate_delta"]
    sign = lambda v: f"+{v}" if v >= 0 else str(v)
    print(f"\n  delta agrégat : precision={sign(ad['precision'])}pt  recall={sign(ad['recall'])}pt  f1={sign(ad['f1'])}pt\n")
    for r in sorted(d["per_article"], key=lambda r: r["f1_delta"]):
        print(f"  {r['stem']:<28} f1 {sign(r['f1_delta']):>6}pt   "
              f"matched {r['n_matched_a']}->{r['n_matched_b']} / {r['n_gt_rels']} GT")


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Harness A/B pour le bloc relations (tableaux seuls vs tableaux+texte)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
exemples :
  iacad-relations-variants run --tag baseline --variant tables+texte
  iacad-relations-variants run --tag tables-only --variant tables
  iacad-relations-variants run --tag full --variant tables+texte --full-corpus
  iacad-relations-variants diff --tag-a baseline --tag-b tables-only
        """,
    )
    sub = ap.add_subparsers(dest="cmd", required=True)

    run_p = sub.add_parser("run", help="Lance un run et le score contre le GT test")
    run_p.add_argument("--tag", required=True, help="Nom du run (réutilisable dans diff)")
    run_p.add_argument("--variant", required=True, choices=list(VARIANTS))
    scope = run_p.add_mutually_exclusive_group()
    scope.add_argument("--fast", action="store_true", help="~16 articles (défaut)")
    scope.add_argument("--n", type=int, metavar="N", help="Les N premiers articles à tableaux (ordre stable) — pour monter en échelle 10 -> 50 -> ...")
    scope.add_argument("--table-subset", action="store_true", help="Les ~100 articles à tableau corrélation/régression")
    scope.add_argument("--full-corpus", action="store_true", help="Les 198 articles du corpus GT test")
    scope.add_argument("--articles", nargs="+", metavar="STEM", help="Liste explicite de stems")
    run_p.add_argument("--model", default=None, help="Modèle Ollama (défaut : common/config/models.yaml)")
    run_p.add_argument("--no-factcheck", action="store_true")
    run_p.add_argument("--debug", action="store_true")
    run_p.add_argument("--keywords", action="store_true",
                        help="Active le RECALL CHECK par mots-clés qualitatifs (experimental, "
                             "voir corr_matrix.scan_keyword_candidates) en plus du scan numerique")

    diff_p = sub.add_parser("diff", help="Compare deux tags déjà lancés")
    diff_p.add_argument("--tag-a", required=True)
    diff_p.add_argument("--tag-b", required=True)

    args = ap.parse_args()

    if args.cmd == "run":
        if args.table_subset:
            stems = table_bearing_stems()
        elif args.full_corpus:
            stems = full_corpus_stems()
        elif args.articles:
            stems = args.articles
        elif args.n:
            stems = table_bearing_stems()[:args.n]
        else:
            stems = fast_subset()

        model_name, model_cfg = extract_mod.load_model_cfg(args.model)
        print(f"Modèle : {model_name}  |  variant={args.variant}  |  mots-cles={args.keywords}  |  {len(stems)} article(s)")
        summary = compute_run_summary(
            args.tag, args.variant, stems, model_name, model_cfg,
            no_factcheck=args.no_factcheck, debug=args.debug, include_keywords=args.keywords,
        )
        _print_summary(summary)
    else:
        _print_diff(compute_diff(args.tag_a, args.tag_b))


if __name__ == "__main__":
    main()
