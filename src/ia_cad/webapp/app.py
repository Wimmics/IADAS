"""
app.py — Front Flask de pilotage du pipeline d'extraction IA-CAD.

Lancer (le package est installé, `pip install -e .`) :
    iacad-webapp
Puis ouvrir http://127.0.0.1:5000

Ne modifie rien au pipeline : réutilise extraction.extract.extract_article(),
compare_results.compare_type() et common.corpus tels quels (voir jobs.py).
"""
import json
from pathlib import Path

import yaml
from flask import Flask, jsonify, request, render_template

from ia_cad.extraction import extract as extract_mod
from ia_cad.common import corpus
from ia_cad.tools.evaluation.compare_results import compare_type, run_type_mode
from ia_cad.tools.evaluation.audit_evidence import compute_audit
from ia_cad.tools.evaluation import relations_variants
from ia_cad.paths import ARTICLE_INDEX, GROUND_TRUTH_DIR, MODELS_YAML
import ia_cad.webapp.jobs as jobs

_ARTICLES_DIR   = extract_mod._ARTICLES
_RESULTS_DIR    = extract_mod._OUT_DIR
_GT_DIR         = GROUND_TRUTH_DIR
_ARTICLE_INDEX  = ARTICLE_INDEX
_MODELS_YAML    = MODELS_YAML
_DATE_RE_GLOB   = "????-??-??"

app = Flask(__name__)


# ─── Helpers ────────────────────────────────────────────────────────────────

def _load_article_index() -> dict:
    if not _ARTICLE_INDEX.exists():
        return {"by_title": {}, "split": {}}
    return json.loads(_ARTICLE_INDEX.read_text(encoding="utf-8"))


def _stem_to_title() -> dict[str, str]:
    idx = _load_article_index()
    out: dict[str, str] = {}
    for title, stem in idx.get("by_title", {}).items():
        out.setdefault(stem, title)
    return out


def _dates_for_stem(stem: str) -> list[str]:
    """Dossiers datés (test ou production) contenant un résultat pour ce stem, triés."""
    if not _RESULTS_DIR.exists():
        return []
    dates = []
    for d in _RESULTS_DIR.glob(_DATE_RE_GLOB):
        if not d.is_dir():
            continue
        if (d / f"{stem}_type.json").exists() or (d / "production" / f"{stem}_type.json").exists():
            dates.append(d.name)
    return sorted(dates)


def _result_path(stem: str, date_str: str) -> Path | None:
    d = _RESULTS_DIR / date_str
    for candidate in (d / f"{stem}_type.json", d / "production" / f"{stem}_type.json"):
        if candidate.exists():
            return candidate
    return None


# ─── Page ───────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


# ─── Articles ───────────────────────────────────────────────────────────────

@app.route("/api/articles")
def api_articles():
    titles = _stem_to_title()
    idx = _load_article_index()
    split = idx.get("split", {})

    articles = []
    for pdf in sorted(_ARTICLES_DIR.glob("*.pdf")):
        stem = pdf.stem
        mode = corpus.mode_for(stem)  # "test" ou "production"
        if mode == "test":
            corpus_label = split.get(stem, "test")  # "train" / "test" (repli "test")
        else:
            corpus_label = "production"
        dates = _dates_for_stem(stem)
        articles.append({
            "stem": stem,
            "title": titles.get(stem),
            "corpus": corpus_label,
            "extractions": dates,
            "latest_date": dates[-1] if dates else None,
        })
    return jsonify(articles)


@app.route("/api/models")
def api_models():
    with open(_MODELS_YAML, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    return jsonify({
        "models": list(cfg.get("models", {}).keys()),
        "default_model": cfg.get("default_model"),
    })


# ─── Extraction ─────────────────────────────────────────────────────────────

@app.route("/api/extract", methods=["POST"])
def api_extract():
    body = request.get_json(force=True) or {}
    stems = body.get("stems") or []
    if not stems:
        return jsonify({"error": "Aucun article sélectionné"}), 400

    chunks = body.get("chunks") or extract_mod.CHUNKS
    invalid = [c for c in chunks if c not in extract_mod.CHUNKS]
    if invalid:
        return jsonify({"error": f"Chunks inconnus : {invalid}"}), 400

    missing = [s for s in stems if not (_ARTICLES_DIR / f"{s}.pdf").exists()]
    if missing:
        return jsonify({"error": f"Articles introuvables : {missing}"}), 400

    job_id = jobs.submit_job(
        stems=stems,
        model=body.get("model") or None,
        chunks=chunks,
        no_factcheck=bool(body.get("no_factcheck")),
        debug=bool(body.get("debug")),
        no_split=bool(body.get("no_split")),
        no_metadata=bool(body.get("no_metadata")),
    )
    return jsonify({"job_id": job_id})


@app.route("/api/jobs")
def api_jobs():
    return jsonify(jobs.list_jobs())


@app.route("/api/jobs/<job_id>")
def api_job_detail(job_id):
    job = jobs.get_job(job_id)
    if job is None:
        return jsonify({"error": "Job inconnu"}), 404
    return jsonify({
        "id": job["id"],
        "kind": job.get("kind", "extract"),
        "status": job["status"],
        "current": job["current"],
        "order": job["order"],
        "articles": job["articles"],
        "log": job["log"][-200:],
        "options": job["options"],
    })


# ─── Résultats ──────────────────────────────────────────────────────────────

@app.route("/api/results/<stem>")
def api_results_dates(stem):
    return jsonify({"stem": stem, "dates": _dates_for_stem(stem)})


@app.route("/api/results/<stem>/<date_str>")
def api_result_detail(stem, date_str):
    path = _result_path(stem, date_str)
    if path is None:
        return jsonify({"error": "Résultat introuvable"}), 404
    return jsonify(json.loads(path.read_text(encoding="utf-8")))


# ─── Comparaison ────────────────────────────────────────────────────────────

@app.route("/api/compare/<stem>")
def api_compare(stem):
    date_str = request.args.get("date")
    dates = _dates_for_stem(stem)
    if not dates:
        return jsonify({"error": "Aucune extraction pour cet article"}), 404
    if date_str is None:
        date_str = dates[-1]
    elif date_str not in dates:
        return jsonify({"error": f"Aucune extraction du {date_str} pour cet article"}), 404

    gt_path = corpus.find_gt(_GT_DIR, stem)
    if gt_path is None:
        return jsonify({"error": "Pas de ground truth pour cet article (hors corpus annoté)"}), 404

    result = json.loads(_result_path(stem, date_str).read_text(encoding="utf-8"))
    gt = json.loads(gt_path.read_text(encoding="utf-8"))
    report = compare_type(result, gt)
    report["date"] = date_str
    return jsonify(report)


# ─── Audit des citations-preuves ────────────────────────────────────────────

@app.route("/api/evidence-audit")
def api_evidence_audit():
    return jsonify(compute_audit(None))


# ─── Comparaison agrégée (scope: tous les articles / articles à tableaux) ──

@app.route("/api/compare-summary")
def api_compare_summary():
    scope = request.args.get("scope", "all")
    if scope == "tables":
        article_filter = relations_variants.table_bearing_stems()
    elif scope == "all":
        article_filter = None
    else:
        return jsonify({"error": "scope invalide (attendu : all, tables)"}), 400

    data = run_type_mode(article_filter, all_dates=False, verbose=False, date_filter=None)
    scores = data["article_scores"]
    n = len(scores)
    agg = {
        "n_articles":      n,
        "sport_rate":      round(sum(s["sport_rate"] for s in scores) / n, 1) if n else 0.0,
        "rel_match_rate":  round(sum(s["rel_match_rate"] for s in scores) / n, 1) if n else 0.0,
        "rel_fields_rate": round(sum(s["rel_fields_rate"] for s in scores) / n, 1) if n else 0.0,
        "analysis_rate":   round(sum(s["analysis_rate"] for s in scores) / n, 1) if n else 0.0,
    }
    return jsonify({"scope": scope, "aggregate": agg, "article_scores": scores})


# ─── Harness A/B relations (tableaux seuls vs tableaux+texte) ──────────────

@app.route("/api/relations-experiments")
def api_relations_experiments():
    return jsonify(relations_variants.list_tags())


@app.route("/api/relations-experiments/run", methods=["POST"])
def api_relations_experiments_run():
    body = request.get_json(force=True) or {}
    tag = (body.get("tag") or "").strip()
    variant = body.get("variant")
    scope = body.get("scope", "fast")

    if not tag:
        return jsonify({"error": "Tag requis"}), 400
    if variant not in relations_variants.VARIANTS:
        return jsonify({"error": f"Variante inconnue : {variant} (attendu : {list(relations_variants.VARIANTS)})"}), 400

    if scope == "table-subset":
        stems = relations_variants.table_bearing_stems()
    elif scope == "full-corpus":
        stems = relations_variants.full_corpus_stems()
    elif scope == "fast":
        stems = relations_variants.fast_subset()
    else:
        return jsonify({"error": f"Scope inconnu : {scope} (attendu : fast, table-subset, full-corpus)"}), 400

    job_id = jobs.submit_relations_variant_job(tag, variant, stems, body.get("model") or None)
    return jsonify({"job_id": job_id, "n_articles": len(stems)})


@app.route("/api/relations-experiments/diff")
def api_relations_experiments_diff():
    tag_a, tag_b = request.args.get("a"), request.args.get("b")
    if not tag_a or not tag_b:
        return jsonify({"error": "Paramètres a et b requis"}), 400
    try:
        return jsonify(relations_variants.compute_diff(tag_a, tag_b))
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404


def main() -> None:
    import argparse
    ap = argparse.ArgumentParser(description="Interface web de pilotage du pipeline IA-CAD.")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=5000)
    args = ap.parse_args()
    # use_reloader=False impératif : le reloader lancerait un 2e process qui
    # dupliquerait la queue/thread de jobs.py (état en mémoire, non partagé).
    app.run(host=args.host, port=args.port, debug=False, use_reloader=False, threaded=True)


if __name__ == "__main__":
    main()
